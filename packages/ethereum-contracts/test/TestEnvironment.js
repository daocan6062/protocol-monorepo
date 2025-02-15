const _ = require("lodash");

const traveler = require("ganache-time-traveler");

const deployFramework = require("../scripts/deploy-framework");
const deployTestToken = require("../scripts/deploy-test-token");
const deploySuperToken = require("../scripts/deploy-super-token");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");

const IERC1820Registry = artifacts.require("IERC1820Registry");
const SuperfluidMock = artifacts.require("SuperfluidMock");
const SuperTokenMock = artifacts.require("SuperTokenMock");
const ConstantFlowAgreementV1 = artifacts.require("ConstantFlowAgreementV1");
const InstantDistributionAgreementV1 = artifacts.require(
    "InstantDistributionAgreementV1"
);
const TestGovernance = artifacts.require("TestGovernance");
const TestToken = artifacts.require("TestToken");

const { BN } = require("@openzeppelin/test-helpers");
const {
    web3tx,
    toWad,
    wad4human,
    toBN,
} = require("@decentral.ee/web3-helpers");

let _singleton;

/**
 * @dev Test environment for test cases
 *
 */
module.exports = class TestEnvironment {
    constructor() {
        this.data = {};
        this._evmSnapshots = [];

        this.configs = {
            INIT_BALANCE: toWad(100),
            AUM_DUST_AMOUNT: toBN(0),
            LIQUIDATION_PERIOD: 3600,
        };

        this.constants = Object.assign(
            {},
            require("@openzeppelin/test-helpers").constants
        );

        this.gasReportType = process.env.ENABLE_GAS_REPORT_TYPE;
    }

    createErrorHandler() {
        return (err) => {
            if (err) throw err;
        };
    }

    static getSingleton() {
        if (!_singleton) {
            _singleton = new TestEnvironment();
        }
        return _singleton;
    }

    /**************************************************************************
     * EVM utilities
     **************************************************************************/

    async _takeEvmSnapshot() {
        return new Promise((resolve, reject) => {
            web3.currentProvider.send(
                {
                    jsonrpc: "2.0",
                    method: "evm_snapshot",
                    params: [],
                },
                (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(result.result);
                }
            );
        });
    }

    async _revertToEvmSnapShot(evmSnapshotId) {
        // NOTE: the evm snapshot is actually deleted
        return new Promise((resolve, reject) => {
            web3.currentProvider.send(
                {
                    jsonrpc: "2.0",
                    method: "evm_revert",
                    params: [evmSnapshotId],
                },
                (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    if (!result.result) {
                        reject(new Error("revertToEvmSnapShot failed"));
                    }
                    resolve();
                }
            );
        });
    }

    async pushEvmSnapshot() {
        let evmSnapshotId = await this._takeEvmSnapshot();
        this._evmSnapshots.push({
            id: evmSnapshotId,
            resolverAddress: process.env.TEST_RESOLVER_ADDRESS,
        });
        console.debug(
            "pushEvmSnapshot",
            evmSnapshotId,
            JSON.stringify(this._evmSnapshots)
        );
    }

    async popEvmSnapshot() {
        this._evmSnapshots.pop();
        console.debug("popEvmSnapshot", JSON.stringify(this._evmSnapshots));
    }

    async useLastEvmSnapshot() {
        let oldEvmSnapshotId;
        ({
            id: oldEvmSnapshotId,
            resolverAddress: process.env.TEST_RESOLVER_ADDRESS,
        } = this._evmSnapshots.pop());
        await this._revertToEvmSnapShot(oldEvmSnapshotId);
        // move the time to now
        await traveler.advanceBlockAndSetTime(parseInt(Date.now() / 1000));
        const newEvmSnapshotId = await this._takeEvmSnapshot();
        this._evmSnapshots.push({
            id: newEvmSnapshotId,
            resolverAddress: process.env.TEST_RESOLVER_ADDRESS,
        });
        console.debug(
            "useLastEvmSnapshot",
            oldEvmSnapshotId,
            JSON.stringify(this._evmSnapshots)
        );
    }

    /**************************************************************************
     * Test suite and test case setup functions
     **************************************************************************/

    /**
     * @dev Run before the test suite
     * @param isTruffle Is test environment initialized in a truffle environment
     * @param nAccounts Number of test accounts to be loaded from web3
     * @param tokens Tokens to be loaded
     */
    async beforeTestSuite({ isTruffle, web3, nAccounts, tokens }) {
        const MAX_TEST_ACCOUNTS = 10;
        nAccounts = nAccounts || 0;
        assert(nAccounts <= MAX_TEST_ACCOUNTS);
        tokens = typeof tokens === "undefined" ? ["TEST"] : tokens;
        const allAccounts = await (web3 || global.web3).eth.getAccounts();
        const testAccounts = allAccounts.slice(0, nAccounts);
        this.setupDefaultAliases(testAccounts);

        // deploy default test environment if needed
        if (this._evmSnapshots.length === 0) {
            // Can we load from externally saved snapshots?
            if (!process.env.TESTENV_SNAPSHOT_VARS) {
                console.log("Creating a new evm snapshot");
                await this.deployFramework({ isTruffle, web3, useMocks: true });
                await this.deployNewToken("TEST", {
                    isTruffle,
                    web3,
                    accounts: allAccounts.slice(0, MAX_TEST_ACCOUNTS),
                });
                await this.pushEvmSnapshot();
            } else {
                console.log("Loading from externally saved snapshot");
                require("dotenv").config({
                    path: process.env.TESTENV_SNAPSHOT_VARS,
                });
                await this._evmSnapshots.push({
                    id: process.env.TESTENV_EVM_SNAPSHOT_ID,
                    resolverAddress: process.env.TEST_RESOLVER_ADDRESS,
                });
                await this.useLastEvmSnapshot();
                await this.mintTestTokensAndApprove("TEST", {
                    isTruffle,
                    web3,
                    accounts: allAccounts.slice(0, nAccounts),
                });
                await this.pushEvmSnapshot();
            }
        } else {
            console.debug(
                "Current evm snapshots",
                JSON.stringify(this._evmSnapshots)
            );
            await this.useLastEvmSnapshot();
        }

        // load the SDK
        this.sf = new SuperfluidSDK.Framework({
            gasReportType: this.gasReportType,
            isTruffle: isTruffle,
            web3,
            version: process.env.RELEASE_VERSION || "test",
            tokens,
        });
        await this.sf.initialize();

        // load contracts with testing/mocking interfaces
        this.contracts = {};
        await Promise.all([
            // load singletons
            (this.contracts.erc1820 = await IERC1820Registry.at(
                "0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24"
            )),
            // load host contract
            (this.contracts.superfluid = await SuperfluidMock.at(
                this.sf.host.address
            )),
            // load agreement contracts
            (this.contracts.cfa = await ConstantFlowAgreementV1.at(
                this.sf.agreements.cfa.address
            )),
            (this.contracts.ida = await InstantDistributionAgreementV1.at(
                this.sf.agreements.ida.address
            )),
            // load governance contract
            (this.contracts.governance = await TestGovernance.at(
                await this.sf.host.getGovernance()
            )),
        ]);
    }

    /*
     * @dev Run before each test case
     */
    async beforeEachTestCase() {
        // return to the parent snapshot and save the same snapshot again
        await this.useLastEvmSnapshot();

        // test data can be persisted here
        this.data = {};

        // reset governace parameters
        await Promise.all([
            await web3tx(
                this.contracts.governance.setCFAv1LiquidationPeriod,
                "reset liquidation period"
            )(
                this.sf.host.address,
                this.constants.ZERO_ADDRESS,
                this.configs.LIQUIDATION_PERIOD
            ),
            await web3tx(
                this.contracts.governance.setRewardAddress,
                "reset reward address to admin"
            )(
                this.sf.host.address,
                this.constants.ZERO_ADDRESS,
                this.aliases.admin
            ),
        ]);
    }

    /// deploy framework
    async deployFramework(deployOpts = {}) {
        // deploy framework
        await deployFramework(this.createErrorHandler(), {
            newTestResolver: true,
            isTruffle: deployOpts.isTruffle,
            web3: deployOpts.web3,
            useMocks: deployOpts.useMocks,
            ...deployOpts,
        });
    }

    /// create a new test token (ERC20) and its super token
    async deployNewToken(
        tokenSymbol,
        { isTruffle, web3, accounts, doUpgrade } = {}
    ) {
        accounts = accounts || this.accounts;

        await deployTestToken(this.createErrorHandler(), [":", tokenSymbol], {
            isTruffle: isTruffle,
            web3,
        });
        await deploySuperToken(this.createErrorHandler(), [":", tokenSymbol], {
            isTruffle: isTruffle,
            web3,
        });

        // load the SDK
        const sf = new SuperfluidSDK.Framework({
            gasReportType: this.gasReportType,
            isTruffle: isTruffle,
            web3,
            version: process.env.RELEASE_VERSION || "test",
        });
        await sf.initialize();
        await sf.loadToken(tokenSymbol);
        const testToken = await TestToken.at(sf.tokens[tokenSymbol].address);
        const superToken = sf.tokens[tokenSymbol + "x"];

        // mint test tokens to test accounts
        for (let i = 0; i < accounts.length; ++i) {
            const userAddress = accounts[i];
            await web3tx(
                testToken.approve,
                `TestToken.approve by account[${i}] to SuperToken`
            )(superToken.address, this.constants.MAX_UINT256, {
                from: userAddress,
            });
            await web3tx(testToken.mint, `Mint token for account[${i}]`)(
                userAddress,
                this.configs.INIT_BALANCE,
                {
                    from: userAddress,
                }
            );
            if (doUpgrade) {
                await web3tx(
                    superToken.upgrade,
                    `Upgrade token for account[${i}]`
                )(this.configs.INIT_BALANCE, {
                    from: userAddress,
                });
            }
        }

        return {
            testToken: testToken,
            superToken: await SuperTokenMock.at(superToken.address),
        };
    }

    async mintTestTokensAndApprove(tokenSymbol, { isTruffle, web3, accounts }) {
        // load the SDK
        const sf = new SuperfluidSDK.Framework({
            gasReportType: this.gasReportType,
            isTruffle: isTruffle,
            web3,
            version: process.env.RELEASE_VERSION || "test",
        });
        await sf.initialize();
        await sf.loadToken(tokenSymbol);
        const testToken = await TestToken.at(sf.tokens[tokenSymbol].address);
        const superToken = sf.tokens[tokenSymbol + "x"];

        // mint test tokens to test accounts
        for (let i = 0; i < accounts.length; ++i) {
            const userAddress = accounts[i];
            await web3tx(
                testToken.approve,
                `TestToken.approve by account[${i}] to SuperToken`
            )(superToken.address, this.constants.MAX_UINT256, {
                from: userAddress,
            });
            await web3tx(testToken.mint, `Mint token for account[${i}]`)(
                userAddress,
                this.configs.INIT_BALANCE,
                {
                    from: userAddress,
                }
            );
        }
    }

    async report({ title }) {
        if (this.gasReportType) {
            await this.sf.generateGasReport(title + ".gasReport");
        }
    }

    /**************************************************************************
     * Alias functions
     *************************************************************************/

    setupDefaultAliases(accounts) {
        this.accounts = accounts;
        this.aliases = {
            admin: accounts[0],
            alice: accounts[1],
            bob: accounts[2],
            carol: accounts[3],
            dan: accounts[4],
            eve: accounts[5],
            frank: accounts[6],
            grace: accounts[7],
            heidi: accounts[8],
            ivan: accounts[9],
        };
        // delete undefined accounts
        Object.keys(this.aliases).forEach((alias) => {
            if (!this.aliases[alias]) delete this.aliases[alias];
        });
        console.log("Aliases", this.aliases);
    }

    listAliases() {
        if (!("moreAliases" in this.data)) this.data.moreAliases = {};
        return Object.keys(this.aliases).concat(
            Object.keys(this.data.moreAliases)
        );
    }

    listAddresses() {
        if (!("moreAliases" in this.data)) this.data.moreAliases = {};
        return Object.values(this.aliases).concat(
            Object.values(this.data.moreAliases)
        );
    }

    addAlias(alias, address) {
        if (!("moreAliases" in this.data)) this.data.moreAliases = {};
        this.data.moreAliases = _.merge(this.data.moreAliases, {
            [alias]: address,
        });
    }

    toAlias(address) {
        return this.listAliases().find(
            (i) => this.getAddress(i).toLowerCase() === address.toLowerCase()
        );
    }

    getAddress(alias) {
        if (!("moreAliases" in this.data)) this.data.moreAliases = {};
        return this.aliases[alias] || this.data.moreAliases[alias];
    }

    /**************************************************************************
     * Test data functions
     *************************************************************************/

    async upgradeBalance(alias, amount, tokenSymbol = "TEST") {
        const testToken = await TestToken.at(
            this.sf.tokens[tokenSymbol].address
        );
        const superToken = this.sf.tokens[tokenSymbol + "x"];
        const account = this.getAddress(alias);
        await web3tx(testToken.mint, `Mint token for ${alias}`)(
            account,
            this.configs.INIT_BALANCE,
            {
                from: account,
            }
        );
        await web3tx(
            superToken.upgrade,
            `Upgrade ${amount.toString()} for account ${alias}`
        )(amount, {
            from: account,
        });
        this.updateAccountBalanceSnapshot(
            superToken.address,
            account,
            await superToken.realtimeBalanceOfNow(account)
        );
    }

    async transferBalance(from, to, amount, tokenSymbol = "TEST") {
        const superToken = this.sf.tokens[tokenSymbol + "x"];
        const fromAccount = this.getAddress(from);
        const toAccount = this.getAddress(to);
        await superToken.transfer(toAccount, amount, {
            from: fromAccount,
        });
        this.updateAccountBalanceSnapshot(
            superToken.address,
            toAccount,
            await superToken.realtimeBalanceOfNow(toAccount)
        );
        this.updateAccountBalanceSnapshot(
            superToken.address,
            fromAccount,
            await superToken.realtimeBalanceOfNow(fromAccount)
        );
    }

    /**************************************************************************
     * Test data functions
     *************************************************************************/

    updateAccountBalanceSnapshot(superToken, account, balanceSnapshot) {
        assert.isDefined(account);
        assert.isDefined(balanceSnapshot);
        assert.isDefined(balanceSnapshot.timestamp);
        _.merge(this.data, {
            tokens: {
                [superToken]: {
                    accounts: {
                        [account]: {
                            balanceSnapshot: {
                                availableBalance:
                                    balanceSnapshot.availableBalance,
                                deposit: balanceSnapshot.deposit,
                                owedDeposit: balanceSnapshot.owedDeposit,
                                timestamp: balanceSnapshot.timestamp,
                            },
                        },
                    },
                },
            },
        });
    }

    getAccountBalanceSnapshot(superToken, account) {
        _.defaultsDeep(this.data, {
            tokens: {
                [superToken]: {
                    accounts: {
                        [account]: {
                            balanceSnapshot: {
                                availableBalance: 0,
                                deposit: 0,
                                owedDeposit: 0,
                                timestamp: 0,
                            },
                        },
                    },
                },
            },
        });
        return _.clone(
            this.data.tokens[superToken].accounts[account].balanceSnapshot
        );
    }

    updateAccountExpectedBalanceDelta(
        superToken,
        account,
        expectedBalanceDelta
    ) {
        assert.isDefined(account);
        assert.isDefined(expectedBalanceDelta);
        _.merge(this.data, {
            tokens: {
                [superToken]: {
                    accounts: {
                        [account]: {
                            expectedBalanceDelta:
                                expectedBalanceDelta.toString(),
                        },
                    },
                },
            },
        });
    }

    getAccountExpectedBalanceDelta(superToken, account) {
        _.defaultsDeep(this.data, {
            tokens: {
                [superToken]: {
                    accounts: {
                        [account]: {
                            expectedBalanceDelta: "0",
                        },
                    },
                },
            },
        });
        return toBN(
            this.data.tokens[superToken].accounts[account].expectedBalanceDelta
        );
    }

    /**************************************************************************
     * Logging utilities
     *************************************************************************/

    realtimeBalance(balance) {
        return toBN(balance.availableBalance).add(
            BN.max(
                toBN(0),
                toBN(balance.deposit).sub(toBN(balance.owedDeposit))
            )
        );
    }

    printSingleBalance(title, balance) {
        console.log(
            `${title}:`,
            `${wad4human(balance)} (${balance.toString()})`
        );
    }

    printRealtimeBalance(title, balance) {
        console.log(
            `${title}: `,
            `${wad4human(
                balance.availableBalance
            )} (${balance.availableBalance.toString()})`,
            `${wad4human(balance.deposit)} (${balance.deposit.toString()})`,
            `${wad4human(
                balance.owedDeposit
            )} (${balance.owedDeposit.toString()})`,
            balance.timestamp.toString()
        );
    }

    /**************************************************************************
     * Invariance tests
     *************************************************************************/

    async validateExpectedBalances(
        syncExpectedBalancesFn,
        tokenSymbol = "TEST"
    ) {
        const superToken = this.sf.tokens[tokenSymbol + "x"];

        const txBlock = await web3.eth.getBlock("latest");
        const balances2 = {};

        // update balance snapshot
        await Promise.all(
            this.listAddresses().map(async (address) => {
                balances2[address] = await superToken.realtimeBalanceOf(
                    address,
                    txBlock.timestamp
                );
                balances2[address].timestamp = txBlock.timestamp;
            })
        );

        await syncExpectedBalancesFn();

        await Promise.all(
            this.listAddresses().map(async (address) => {
                const alias = this.toAlias(address);

                const balanceSnapshot1 = this.getAccountBalanceSnapshot(
                    superToken.address,
                    address
                );
                const realtimeBalanceDelta = this.realtimeBalance(
                    balances2[address]
                ).sub(this.realtimeBalance(balanceSnapshot1));
                this.printSingleBalance(
                    `${alias} actual real-time balance delta`,
                    realtimeBalanceDelta
                );

                const expectedBalanceDelta =
                    this.getAccountExpectedBalanceDelta(
                        superToken.address,
                        address
                    );
                this.printSingleBalance(
                    `${alias} expected real-time balance delta`,
                    expectedBalanceDelta
                );

                assert.equal(
                    realtimeBalanceDelta.toString(),
                    expectedBalanceDelta.toString(),
                    `wrong real-time balance changes of ${alias}`
                );

                this.updateAccountBalanceSnapshot(
                    superToken.address,
                    address,
                    balances2[address]
                );

                this.updateAccountExpectedBalanceDelta(
                    superToken.address,
                    address,
                    0
                );
            })
        );
    }

    async validateSystemInvariance({ allowCriticalAccount, tokenSymbol } = {}) {
        tokenSymbol = tokenSymbol || "TEST";
        const testToken = this.sf.tokens[tokenSymbol];
        const superToken = this.sf.tokens[tokenSymbol + "x"];
        console.log("======== validateSystemInvariance begins ========");

        const currentBlock = await web3.eth.getBlock("latest");

        let rtBalanceSum = toBN(0);
        await Promise.all(
            this.listAliases().map(async (alias) => {
                const userAddress = this.getAddress(alias);
                const tokenBalance = await testToken.balanceOf.call(
                    userAddress
                    /* TODO query old block currentBlock.timestamp*/
                );
                const superTokenBalance =
                    await superToken.realtimeBalanceOf.call(
                        userAddress,
                        currentBlock.timestamp.toString()
                    );
                superTokenBalance.timestamp = currentBlock.timestamp;
                // Available Balance = Realtime Balance - Deposit + Min(Deposit, Owed Deposit)
                const realtimeBalance = superTokenBalance.availableBalance
                    .add(superTokenBalance.deposit)
                    .sub(
                        web3.utils.BN.min(
                            superTokenBalance.owedDeposit,
                            superTokenBalance.deposit
                        )
                    );

                this.printSingleBalance(
                    `${alias} underlying token balance`,
                    tokenBalance
                );
                console.log(
                    `${alias} super token balance`,
                    wad4human(realtimeBalance)
                );
                this.printRealtimeBalance(
                    `${alias} super token balance (tuple)`,
                    superTokenBalance
                );

                if (!allowCriticalAccount) {
                    assert.isTrue(
                        superTokenBalance.availableBalance.gte(toBN(0)),
                        `${alias} account is critical`
                    );
                }

                rtBalanceSum = rtBalanceSum.add(realtimeBalance);
            })
        );

        this.printSingleBalance(
            "Total real-time blances of super tokens",
            rtBalanceSum
        );

        const aum = await testToken.balanceOf.call(superToken.address);
        this.printSingleBalance("AUM of super tokens", aum);

        const totalSupply = await superToken.totalSupply.call();
        this.printSingleBalance("Total supply of super tokens", totalSupply);

        assert.isTrue(
            aum.gte(rtBalanceSum),
            "AUM should be equal or more than real-time balance"
        );
        assert.isTrue(
            aum.sub(rtBalanceSum).lte(this.configs.AUM_DUST_AMOUNT),
            "AUM minus the real-time balance sum should only be a dust amount"
        );
        assert.equal(
            wad4human(aum, 8),
            wad4human(rtBalanceSum, 8),
            "AUM should match the real-time balance sum to at least 8 decimals during testing"
        );
        assert.equal(
            aum.toString(),
            totalSupply.toString(),
            "Total supply should be equal to the AUM"
        );

        console.log("======== validateSystemInvariance ends ========");
    }
};
