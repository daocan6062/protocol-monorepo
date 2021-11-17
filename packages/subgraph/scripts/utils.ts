import { toBN } from "../test/helpers/helpers";
import { IDataIntegritySubscription } from "./interfaces";

// NOTE: THIS IS SOMEWHAT REPLICATED IN SDK-CORE utils.ts file, but is somewhat different
// in terms of the types the functions take and it also calculates using BigNumber here

/**
 * @dev The formula for calculating the flowed amount since updated using Subgraph data.
 * @param netFlowRate the net flow rate of the user
 * @param currentTimestamp the current timestamp
 * @param updatedAtTimestamp the updated at timestamp of the `AccountTokenSnapshot` entity
 * @returns the flowed amount since the updatedAt timestamp
 */
export const flowedAmountSinceUpdatedAt = ({
    netFlowRate,
    currentTimestamp,
    updatedAtTimestamp,
}: {
    netFlowRate: string;
    currentTimestamp: string;
    updatedAtTimestamp: string;
}) => {
    return toBN(currentTimestamp)
        .sub(toBN(updatedAtTimestamp))
        .mul(toBN(netFlowRate));
};

/**
 * @dev The formula for calculating the total amount distributed to the subscriber (pending or received).
 * @param indexSubscriptions the index subscriptions of a single token from an account.
 * @returns the total amount received since updated at (both pending and actually distributed)
 */
export const subscriptionTotalAmountDistributedSinceUpdated = (
    indexSubscriptions: IDataIntegritySubscription[]
) => {
    return indexSubscriptions.reduce(
        (x, y) =>
            x.add(
                toBN(y.index.indexValue)
                    .sub(toBN(y.indexValueUntilUpdatedAt))
                    .mul(toBN(y.units))
            ),
        toBN(0)
    );
};

/**
 * @dev The formula for calculating the total amount received (approved subscriptions).
 * @param indexSubscriptions the index subscriptions of a single token from an account.
 * @returns the total amount received since updated at (actually distributed into wallet)
 */
export const subscriptionTotalAmountReceivedSinceUpdated = (
    indexSubscriptions: IDataIntegritySubscription[]
) => {
    return indexSubscriptions
        .filter((x) => x.approved)
        .reduce(
            (x, y) =>
                x.add(
                    toBN(y.index.indexValue)
                        .sub(toBN(y.indexValueUntilUpdatedAt))
                        .mul(toBN(y.units))
                ),
            toBN(0)
        );
};

/**
 * @dev The formula for calculating the total amount that is claimable.
 * @param indexSubscriptions the index subscriptions of a single token from an account.
 * @returns the total amount that can be claimed since updated at
 */
export const subscriptionTotalAmountClaimableSinceUpdatedAt = (
    indexSubscriptions: IDataIntegritySubscription[]
) => {
    return subscriptionTotalAmountDistributedSinceUpdated(
        indexSubscriptions
    ).sub(subscriptionTotalAmountReceivedSinceUpdated(indexSubscriptions));
};

/**
 * @dev The formula for calculating the balance until updated at of a user (claimable + received tokens from index)
 * @param currentBalance the current balance until updated at from the `AccountTokenSnapshot` entity
 * @param netFlowRate the net flow rate of the user
 * @param currentTimestamp the current timestamp
 * @param updatedAtTimestamp the updated at timestamp of the `AccountTokenSnapshot` entity
 * @returns the balance since the updated at timestamp
 */
export const getBalance = ({
    currentBalance,
    netFlowRate,
    currentTimestamp,
    updatedAtTimestamp,
    indexSubscriptions,
}: {
    currentBalance: string;
    netFlowRate: string;
    currentTimestamp: string;
    updatedAtTimestamp: string;
    indexSubscriptions: IDataIntegritySubscription[];
}) => {
    return toBN(currentBalance)
        .add(
            flowedAmountSinceUpdatedAt({
                netFlowRate,
                currentTimestamp,
                updatedAtTimestamp,
            })
        )
        .add(subscriptionTotalAmountReceivedSinceUpdated(indexSubscriptions));
};
