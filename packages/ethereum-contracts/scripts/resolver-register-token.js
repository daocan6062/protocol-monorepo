const { web3tx } = require("@decentral.ee/web3-helpers");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");

const getConfig = require("./libs/getConfig");

const {
    getScriptRunnerFactory: S,
    extractWeb3Options,
    builtTruffleContractLoader,
} = require("./libs/common");

/**
 * @dev Deploy test token (Mintable ERC20) to the network.
 * @param {Array} argv Overriding command line arguments
 * @param {boolean} options.isTruffle Whether the script is used within native truffle framework
 * @param {Web3} options.web3  Injected web3 instance
 * @param {Address} options.from Address to deploy contracts from
 * @param {boolean} options.resetToken Reset the token deployment
 *
 * Usage: npx truffle exec scripts/resolver-register-token.js : {TOKEN_NAME} {TOKEN_ADDRESS}
 */
module.exports = eval(`(${S.toString()})()`)(async function (
    args,
    options = {}
) {
    console.log("======== Register test token ========");
    let { resetToken } = options;

    if (args.length !== 2) {
        throw new Error("Wrong number of arguments");
    }
    const tokenAddress = args.pop();
    const tokenName = args.pop();
    console.log("Token name", tokenName);
    console.log("Token name", tokenAddress);

    resetToken = resetToken || !!process.env.RESET_TOKEN;
    const chainId = await web3.eth.net.getId(); // TODO use eth.getChainId;
    const config = getConfig(chainId);
    console.log("reset token: ", resetToken);
    console.log("chain ID: ", chainId);

    const { TestResolver } = await SuperfluidSDK.loadContracts({
        ...extractWeb3Options(options),
        additionalContracts: ["TestResolver"],
        contractLoader: builtTruffleContractLoader,
    });

    const testResolver = await TestResolver.at(config.resolverAddress);
    console.log("Resolver address", testResolver.address);

    const name = `tokens.${tokenName}`;
    let testTokenAddress = await testResolver.get(name);

    if (
        resetToken ||
        testTokenAddress === "0x0000000000000000000000000000000000000000"
    ) {
        await web3tx(testResolver.set, `TestResolver set ${name}`)(
            name,
            tokenAddress
        );
    } else {
        console.log("Token already set");
    }

    console.log("======== Test token registered ======");
});
