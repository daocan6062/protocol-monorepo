import { ethers } from "hardhat";
import _ from "lodash";
import { toBN } from "../test/helpers/helpers";
import maticAddresses from "../config/matic.json";
import cfaABI from "../abis/IConstantFlowAgreementV1.json";
import superTokenABI from "../abis/ISuperToken.json";
import idaABI from "../abis/IInstantDistributionAgreementV1.json";
import {
    getIndexes,
    getStreams,
    getSubscriptions,
} from "../test/queries/dataIntegrityQueries";
import {
    IBaseEntity,
    IDataIntegrityAccountTokenSnapshot,
    IDataIntegrityIndex,
    IDataIntegrityStream,
    IDataIntegritySubscription,
} from "./interfaces";
import { chainIdToData } from "./maps";
import { ConstantFlowAgreementV1 } from "../typechain/ConstantFlowAgreementV1";
import { InstantDistributionAgreementV1 } from "../typechain/InstantDistributionAgreementV1";
import request, { gql } from "graphql-request";
import { IMeta } from "../test/interfaces";
import { getBalance } from "./utils";
import { Provider } from "@ethersproject/abstract-provider";
import { SuperToken } from "../typechain";

const subgraphRequest = async <T>(
    query: string,
    subgraphEndpoint: string,
    variables?: { [key: string]: any }
): Promise<T> => {
    try {
        const response = await request<T>(subgraphEndpoint, query, variables);
        return response;
    } catch (err) {
        throw new Error(
            `Failed call to subgraph with query ${query} and error ${err}`
        );
    }
};

const getMostRecentIndexedBlockNumber = async (subgraphEndpoint: string) => {
    const query = gql`
        query {
            _meta {
                block {
                    number
                }
            }
        }
    `;
    const data = await subgraphRequest<IMeta>(query, subgraphEndpoint);
    if (!data) return 0;

    return data._meta.block.number;
};

/**
 * @dev Chunks the promises as we don't want to exhaust CPU.
 * e.g. trying to do a promise for 5,000 items at once.
 */
function chunkPromises(promises: Promise<void>[], chunkLength: number) {
    const chunksLength = Math.ceil(promises.length / chunkLength);
    const batches = Array.apply(null, Array(chunksLength)).map((_x, i) =>
        promises.slice(i * chunkLength, chunkLength * (i + 1))
    );
    return batches;
}

/**
 * @dev Gets all the results from the graph, we need this function
 * due to the 1,000 item limitation imposed by the
 */
const getAllResults = async <T extends IBaseEntity>(
    query: string,
    endpoint: string,
    blockNumber: number,
    resultsPerPage: number,
    createdAtTimestamp: number = 0
): Promise<T[]> => {
    const initialResults = await subgraphRequest<{ response: T[] }>(
        query,
        endpoint,
        {
            blockNumber,
            first: resultsPerPage,
            createdAt: createdAtTimestamp,
        }
    );

    if (initialResults.response.length < resultsPerPage) {
        return initialResults.response;
    }
    let newCreatedAtTimestamp =
        initialResults.response[initialResults.response.length - 1]
            .createdAtTimestamp;

    return [
        ...initialResults.response,
        ...((await getAllResults(
            query,
            endpoint,
            blockNumber,
            resultsPerPage,
            Number(newCreatedAtTimestamp)
        )) as T[]),
    ];
};

// Validation Logic Helper Functions
const validateATSNetFlowRate = async (
    cfaV1: ConstantFlowAgreementV1,
    ats: IDataIntegrityAccountTokenSnapshot,
    currentBlockNumber: number
) => {
    try {
        const netFlowRate = await cfaV1.getNetFlow(
            ats.token.id,
            ats.account.id,
            {
                blockTag: currentBlockNumber,
            }
        );
        const netFlowRateShouldMatch = netFlowRate.eq(
            toBN(ats.totalNetFlowRate)
        );
        if (!netFlowRateShouldMatch) {
            throw new Error(
                "Values don't match. \n Subgraph Net Flow Rate: " +
                    ats.totalNetFlowRate +
                    "\n Contract Data Net Flow Rate: " +
                    netFlowRate.toString()
            );
        }
    } catch (err) {
        console.error(err);
    }
};

const validateATSBalance = async (
    idaV1: InstantDistributionAgreementV1,
    tokenAddress: string,
    ats: IDataIntegrityAccountTokenSnapshot,
    currentTimestamp: number,
    currentBlockNumber: number,
    subscriptions: IDataIntegritySubscription[],
    provider: Provider
) => {
    try {
        const userSubscriptions = subscriptions.filter(
            (x) =>
                x.subscriber.id === ats.account.id &&
                x.index.token.id === tokenAddress
        );
        const promises = userSubscriptions.map((x) =>
            idaV1.getSubscription(
                tokenAddress,
                x.index.publisher.id,
                x.index.indexId,
                x.subscriber.id
            )
        );
        const datas = await Promise.all(promises);

        const totalClaimable = datas
            .map((x) => x.pendingDistribution)
            .reduce((x, y) => x.add(y), toBN(0));

        const tokenContract = new ethers.Contract(
            tokenAddress,
            superTokenABI,
            provider
        ) as SuperToken;
        const { availableBalance } = await tokenContract.realtimeBalanceOf(
            ats.account.id,
            currentTimestamp,
            { blockTag: currentBlockNumber }
        );
        const web3Balance = totalClaimable.add(availableBalance);
        // validate subgraph calculated balance = realtimebalance + claimable (not sure how we get this from contracts)
        const calculatedSubgraphBalance = getBalance({
            currentBalance: ats.balanceUntilUpdatedAt,
            netFlowRate: ats.totalNetFlowRate,
            currentTimestamp: currentTimestamp.toString(),
            updatedAtTimestamp: ats.updatedAtTimestamp,
            indexSubscriptions: userSubscriptions,
        });

        if (!web3Balance.eq(calculatedSubgraphBalance)) {
            throw new Error(
                "Web3 RealtimeBalance + total claimable amount is not the same as the calculated subgraph balance" +
                    "\n Web3: " +
                    web3Balance.toString() +
                    " \n Subgraph: " +
                    calculatedSubgraphBalance.toString()
            );
        }
    } catch (err) {
        console.error(err);
    }
};

const validateStreamData = async (
    cfaV1: ConstantFlowAgreementV1,
    stream: IDataIntegrityStream,
    currentBlockNumber: number
) => {
    try {
        const token = ethers.utils.getAddress(stream.token.id);
        const sender = ethers.utils.getAddress(stream.sender.id);
        const receiver = ethers.utils.getAddress(stream.receiver.id);
        const [updatedAtTimestamp, flowRate] = await cfaV1.getFlow(
            token,
            sender,
            receiver,
            {
                blockTag: currentBlockNumber,
            }
        );
        const updatedAtShouldMatch = updatedAtTimestamp.eq(
            toBN(stream.updatedAtTimestamp)
        );
        const flowRateShouldMatch = flowRate.eq(toBN(stream.currentFlowRate));
        const compareStream = {
            updatedAtTimestamp: stream.updatedAtTimestamp,
            currentFlowRate: stream.currentFlowRate,
        };
        if (!updatedAtShouldMatch || !flowRateShouldMatch) {
            throw new Error(
                "Values don't match. \n Subgraph Stream: " +
                    JSON.stringify(compareStream) +
                    "\n Contract Data \n Updated At Timestamp: " +
                    updatedAtTimestamp.toString() +
                    " \n Flow Rate: " +
                    flowRate.toString()
            );
        }
    } catch (err) {
        console.error("Error: ", err);
    }
};

const validateIndexData = async (
    idaV1: InstantDistributionAgreementV1,
    index: IDataIntegrityIndex,
    currentBlockNumber: number
) => {
    try {
        const superToken = ethers.utils.getAddress(index.token.id);
        const publisher = ethers.utils.getAddress(index.publisher.id);
        const indexId = Number(index.indexId);
        const [, indexValue, totalUnitsApproved, totalUnitsPending] =
            await idaV1.getIndex(superToken, publisher, indexId, {
                blockTag: currentBlockNumber,
            });
        const indexValueShouldMatch = toBN(index.indexValue).eq(indexValue);
        const totalUnitsApprovedShouldMatch = toBN(index.totalUnitsApproved).eq(
            totalUnitsApproved
        );
        const totalUnitsPendingShouldMatch = toBN(index.totalUnitsPending).eq(
            totalUnitsPending
        );
        const totalUnits = totalUnitsApproved.add(totalUnitsPending);

        // Check that Index total units on both subgraph and web3 is equal to sum of Index.subscription units
        const totalSubscriptionApprovedUnits = index.subscriptions
            .filter((x) => x.approved)
            .reduce((x, y) => x.add(toBN(y.units)), toBN(0));
        const totalSubscriptionPendingUnits = index.subscriptions
            .filter((x) => !x.approved)
            .reduce((x, y) => x.add(toBN(y.units)), toBN(0));
        const totalSubscriptionUnits = totalSubscriptionApprovedUnits.add(
            totalSubscriptionPendingUnits
        );
        const totalApprovedUnitsAreEqual =
            totalSubscriptionApprovedUnits.eq(totalUnitsApproved) &&
            totalSubscriptionApprovedUnits.eq(toBN(index.totalUnitsApproved));
        const totalPendingUnitsAreEqual =
            totalSubscriptionPendingUnits.eq(totalUnitsPending) &&
            totalSubscriptionPendingUnits.eq(toBN(index.totalUnitsPending));
        const totalUnitsAreEqual =
            totalSubscriptionUnits.eq(totalUnits) &&
            totalSubscriptionUnits.eq(toBN(index.totalUnits));

        if (!totalApprovedUnitsAreEqual) {
            throw new Error(
                "Total approved units not equal: " +
                    "\n TotalSubscriptionApprovedUnits: " +
                    totalSubscriptionApprovedUnits.toString() +
                    "\n totalUnitsApproved (subgraph): " +
                    index.totalUnitsApproved +
                    "\n totalUnitsApproved (web3): " +
                    totalUnitsApproved.toString()
            );
        }
        if (!totalPendingUnitsAreEqual) {
            throw new Error(
                "Total approved units not equal: " +
                    "\n TotalSubscriptionPendingUnits: " +
                    totalSubscriptionPendingUnits.toString() +
                    "\n totalUnitsPending (subgraph): " +
                    index.totalUnitsPending +
                    "\n totalUnitsPending (web3): " +
                    totalUnitsPending.toString()
            );
        }
        if (!totalUnitsAreEqual) {
            throw new Error(
                "Total approved units not equal: " +
                    "\n TotalSubscriptionUnits: " +
                    totalSubscriptionUnits.toString() +
                    "\n totalUnits (subgraph): " +
                    index.totalUnits +
                    "\n totalUnits (web3): " +
                    totalUnits.toString()
            );
        }

        const compareIndex = {
            id: index.id,
            indexValue: index.indexValue,
            totalUnitsApproved: index.totalUnitsApproved,
            totalUnitsPending: index.totalUnitsPending,
        };
        if (
            !indexValueShouldMatch ||
            !totalUnitsApprovedShouldMatch ||
            !totalUnitsPendingShouldMatch
        ) {
            throw new Error(
                "Values don't match. \n Subgraph Index: " +
                    JSON.stringify(compareIndex) +
                    "\n Contract Data \n Index Value: " +
                    indexValue.toString() +
                    " \n Approved Units: " +
                    totalUnitsApproved.toString() +
                    " \n Pending Units: " +
                    totalUnitsPending.toString()
            );
        }
    } catch (err) {
        console.error("Error: ", err);
    }
};

const validateSubscriptionData = async (
    idaV1: InstantDistributionAgreementV1,
    subscription: IDataIntegritySubscription,
    currentBlockNumber: number
) => {
    try {
        const superToken = ethers.utils.getAddress(subscription.index.token.id);
        const publisher = ethers.utils.getAddress(
            subscription.index.publisher.id
        );
        const subscriber = ethers.utils.getAddress(subscription.subscriber.id);
        const indexId = Number(subscription.index.indexId);
        const [, approved, units, pendingDistribution] =
            await idaV1.getSubscription(
                superToken,
                publisher,
                indexId,
                subscriber,
                { blockTag: currentBlockNumber }
            );
        const expectedPendingDistribution = subscription.approved
            ? toBN(0)
            : toBN(subscription.units).mul(
                  toBN(subscription.index.indexValue).sub(
                      toBN(subscription.indexValueUntilUpdatedAt)
                  )
              );
        const approvedShouldMatch = approved === subscription.approved;
        const unitsShouldMatch = toBN(subscription.units).eq(units);
        const pendingDistributionShouldMatch =
            expectedPendingDistribution.eq(pendingDistribution);
        const compareSubscription = {
            id: subscription.id,
            approved: subscription.approved,
            units: subscription.units,
            pendingDistribution: expectedPendingDistribution.toString(),
        };

        if (
            !approvedShouldMatch ||
            !unitsShouldMatch ||
            !pendingDistributionShouldMatch
        ) {
            throw new Error(
                "Values don't match. \n Subgraph Subscription: " +
                    JSON.stringify(compareSubscription) +
                    "\n Contract Data \n Approved: " +
                    approved +
                    " \n Units: " +
                    units.toString() +
                    " \n Pending Units: " +
                    pendingDistribution.toString()
            );
        }
    } catch (error) {
        console.error("Error: ", error);
    }
};

// Agreement Validation Harness Helper Functions
const validateCFAData = async (
    cfaV1: ConstantFlowAgreementV1,
    chainIdData: {
        subgraphAPIEndpoint: string;
        name: string;
    },
    currentBlockNumber: number
) => {
    console.log("Getting CFA data from the subgraph...");
    const streams = await getAllResults<IDataIntegrityStream>(
        getStreams,
        chainIdData.subgraphAPIEndpoint,
        currentBlockNumber,
        1000
    );
    const uniqueStreams = _.uniqBy(
        streams,
        (x) => x.createdAtTimestamp + x.sender.id + x.receiver.id + x.token.id
    );

    const validateStreamPromises = uniqueStreams.map((x) =>
        validateStreamData(cfaV1, x, currentBlockNumber)
    );
    const chunkedStreamPromises = chunkPromises(validateStreamPromises, 100);

    console.log("Stream Tests Starting...");
    console.log("Validating " + validateStreamPromises.length + " streams.");
    for (let i = 0; i < chunkedStreamPromises.length; i++) {
        await Promise.all(chunkedStreamPromises[i]);
    }
    console.log("Stream Tests Successful!");

    return { uniqueStreams };
};

const validateIDAData = async (
    idaV1: InstantDistributionAgreementV1,
    chainIdData: {
        subgraphAPIEndpoint: string;
        name: string;
    },
    currentBlockNumber: number
) => {
    console.log("Getting IDA data from the subgraph...");
    const indexes = await getAllResults<IDataIntegrityIndex>(
        getIndexes,
        chainIdData.subgraphAPIEndpoint,
        currentBlockNumber,
        1000
    );
    const subscriptions = await getAllResults<IDataIntegritySubscription>(
        getSubscriptions,
        chainIdData.subgraphAPIEndpoint,
        currentBlockNumber,
        1000
    );

    const indexPromises = indexes.map((x) =>
        validateIndexData(idaV1, x, currentBlockNumber)
    );

    const subscriptionPromises = subscriptions.map((x) =>
        validateSubscriptionData(idaV1, x, currentBlockNumber)
    );
    const chunkedIndexPromises = chunkPromises(indexPromises, 100);
    const chunkedSubscriptionPromises = chunkPromises(
        subscriptionPromises,
        100
    );
    console.log("Index Tests Starting...");
    console.log("Validating " + indexPromises.length + " indexes.");
    for (let i = 0; i < chunkedIndexPromises.length; i++) {
        await Promise.all(chunkedIndexPromises[i]);
    }
    console.log("Index Tests Successful!");
    console.log("Subscription Tests Starting...");
    console.log(
        "Validating " + subscriptionPromises.length + " subscriptions."
    );
    for (let i = 0; i < chunkedSubscriptionPromises.length; i++) {
        await Promise.all(chunkedSubscriptionPromises[i]);
    }
    console.log("Subscription Tests Successful!");

    return { indexes, subscriptions };
};

const validateAggregateEntityData = async (
    idaV1: InstantDistributionAgreementV1,
    cfaV1: ConstantFlowAgreementV1,
    uniqueStreams: IDataIntegrityStream[],
    currentTimestamp: number,
    currentBlockNumber: number,
    subscriptions: IDataIntegritySubscription[],
    provider: Provider
) => {
    const uniqueAccountTokenSnapshots = _.uniqBy(
        uniqueStreams
            .map((x) => [
                ...x.sender.accountTokenSnapshots,
                ...x.receiver.accountTokenSnapshots,
            ])
            .flat(),
        (x) => x.account.id + x.token.id
    );

    // NOTE: each token's net flow should be 0, so summing all
    // should also equal to 0.
    console.log("Validate Sum of CFA total netflow === zero");
    const sumNetFlows = uniqueAccountTokenSnapshots.reduce(
        (x, y) => x + Number(y.totalNetFlowRate),
        0
    );

    if (sumNetFlows !== 0) {
        throw new Error("Sum of CFA total netflow !== zero");
    }
    console.log("Sum of CFA total netflow === zero is true");

    const accountTokenSnapshotBalancePromises = uniqueAccountTokenSnapshots.map(
        (x) =>
            validateATSBalance(
                idaV1,
                x.token.id,
                x,
                currentBlockNumber,
                currentTimestamp,
                subscriptions,
                provider
            )
    );

    const chunkedATSBalancePromises = chunkPromises(
        accountTokenSnapshotBalancePromises,
        100
    );

    const accountTokenSnapshotNetflowPromises = uniqueAccountTokenSnapshots.map(
        (x) => validateATSNetFlowRate(cfaV1, x, currentBlockNumber)
    );
    const chunkedATSNetFlowPromises = chunkPromises(
        accountTokenSnapshotNetflowPromises,
        100
    );
    console.log("Account Token Snapshot Tests Starting...");
    console.log(
        "Validating " +
            accountTokenSnapshotNetflowPromises.length +
            " account token snapshots."
    );
    console.log("Validating ATS Net flows...");
    for (let i = 0; i < chunkedATSNetFlowPromises.length; i++) {
        await Promise.all(chunkedATSNetFlowPromises[i]);
    }

    console.log("Validating ATS Balances...");
    for (let i = 0; i < chunkedATSBalancePromises.length; i++) {
        await Promise.all(chunkedATSBalancePromises[i]);
    }
    console.log("Account Token Snapshot Tests Successful!");
};

const main = async () => {
    try {
        const network = await ethers.provider.getNetwork();
        const [signer] = await ethers.getSigners();
        const provider = signer.provider!;
        const chainId = network.chainId;
        const chainIdData = chainIdToData.get(chainId);
        if (chainIdData == null) {
            throw new Error(
                "chainId " + chainId + " is not a supported chainId."
            );
        }
        // Give the Indexer 150 block cushion
        const currentBlockNumber = await getMostRecentIndexedBlockNumber(
            chainIdData.subgraphAPIEndpoint
        );
        const block = await ethers.provider.getBlock(currentBlockNumber);
        const currentTimestamp = block.timestamp;
        console.log(
            "Executing Subgraph Data Integrity Test on " +
                chainIdData.name +
                " network."
        );
        console.log("Current block number used to query: ", currentBlockNumber);
        console.log("Current timestamp at block: ", currentTimestamp);

        const cfaV1 = (await ethers.getContractAt(
            cfaABI,
            maticAddresses.cfaAddress
        )) as ConstantFlowAgreementV1;
        const idaV1 = (await ethers.getContractAt(
            idaABI,
            maticAddresses.idaAddress
        )) as InstantDistributionAgreementV1;
        const { uniqueStreams } = await validateCFAData(
            cfaV1,
            chainIdData,
            currentBlockNumber
        );

        const { subscriptions } = await validateIDAData(
            idaV1,
            chainIdData,
            currentBlockNumber
        );

        await validateAggregateEntityData(
            idaV1,
            cfaV1,
            uniqueStreams,
            currentTimestamp,
            currentBlockNumber,
            subscriptions,
            provider
        );
    } catch (err) {
        console.error(err);
    }
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
