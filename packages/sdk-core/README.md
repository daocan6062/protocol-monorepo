<h1 align="center">sdk-core</h1>
<div align="center">
<img  width="300" padding="0 0 10px" alt="Superfluid logo" src="/sf-logo.png" />
<p>
  <a href="https://www.npmjs.com/package/@superfluid-finance/sdk-core" target="_blank">
    <img alt="Version" src="https://img.shields.io/npm/v/@superfluid-finance/sdk-core.svg">
  </a>
  <a href="https://codecov.io/gh/superfluid-finance/protocol-monorepo/tree/dev/packages/sdk-core">
    <img src="https://codecov.io/gh/superfluid-finance/protocol-monorepo/branch/dev/graph/badge.svg?token=LJW5NDGEJ9&flag=sdk-core"/>
  </a>
  <a href="#" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" />
  </a>
  <a href="https://twitter.com/Superfluid_HQ/" target="blank">
    <img alt="Twitter: Superfluid_HQ" src="https://img.shields.io/twitter/follow/Superfluid_HQ.svg?style=social" />
  </a>
</p>
</div>

### 🏠 [Homepage](https://superfluid.finance)

### ✨ [Superfluid App](https://app.superfluid.finance/)

### 📖 [Docs](https://docs.superfluid.finance)

# Prerequisites

To get the package up and running you'll need to install the necessary dependencies and build the project:

```bash
yarn install && yarn build
```

# Usage

## Framework Initialization

Here is a quick look at initialzing the SDK in different environments:

TypeScript / JavaScript (Module):

```ts
import { Framework } from "@superfluid-finance/sdk-core";
import { ethers } from "ethers";

const provider = new ethers.providers.InfuraProvider(
  "matic",
  "<INFURA_API_KEY>"
);
const sf = await Framework.create({
  networkName: "matic",
  provider
});

// web3.js + Hardhat provider initialization
const web3jsProvider = new ethers.providers.Web3Provider(
  (global as any).web3.currentProvider
);
const web3jsSf = await Framework.create({
  networkName: "matic",
  provider: web3jsProvider
});
```

JavaScript (CommonJS) - usually a Node.js environment:

```js
const { Framework } = require("@superfluid-finance/sdk-core");
const { ethers } = require("ethers");

const provider = new ethers.providers.InfuraProvider(
  "matic",
  "<INFURA_API_KEY>"
);
const sf = await Framework.create({
  networkName: "matic",
  provider
});

// web3.js + Hardhat provider initialization
const web3jsProvider = new ethers.providers.Web3Provider(
  global.web3.currentProvider
);
const web3jsSf = await Framework.create({
  networkName: "matic",
  provider: web3jsProvider
});
```

> Note: You specify your project type in `package.json` - `"type": "module"` or `"type": "commonjs"`.

This is the absolute minimum you need to provide the constructor (`chainId` or `networkName` and a `provider` object) if all you want to do are read operations. It is also important to note that the provider does not need to be an InfuraProvider - it just needs to satisfy the `ethers.Provider` interface.

## Helper Classes

The `Framework` includes a variety of helper classes which can be directly accessed upon initialization, but can also be initialized as standalone classes if desired.

### Query

Once you have initialized the `Framework` class using `Framework.create`, you can make queries using it easily.

#### Pre-Defined Queries

A list of the pre-defined queries:

```ts
const { Framework } = require("@superfluid-finance/sdk-core");
const { ethers } = require("ethers");

const provider = new ethers.providers.InfuraProvider(
	"matic",
	"<INFURA_API_KEY>"
);
const sf = await Framework.create({
  networkName: "matic",
	provider
});

const pageResult = await sf.query.
  listAllSuperTokens({ isListed?: boolean }, { skip: number, take: number });
  listIndexes({ indexId?: string, publisher?: string, token?: string }, { skip: number, take: number });
  listIndexSubscriptions({ subscriber?: string, approved?: boolean }, { skip: number, take: number });
  listStreams({ sender?: string, receiver?: string, token?: string }, { skip: number, take: number });
  listUserInteractedSuperTokens({ account?: string, token?: string }, { skip: number, take: number });
```

#### Direct Initialization

If you'd like, you can also initialize the `Query` class as a standalone class like so:

```ts
import { Query } from "@superfluid-finance/sdk-core";
const query = new Query({ customSubgraphQueriesEndpoint: "<A_CUSTOM_ENDPOINT>", dataMode: "SUBGRAPH_ONLY" | "SUBGRAPH_WEB3" | "WEB3_ONLY" });
query.listAllSuperTokens({ isListed?: boolean }, { skip: number, take: number })
//...same queries as above...
```

#### Pagination

All of the pre-defined query functions will accept pagination options: `({ skip: number, take: number })`, if you don't pass anything in, it will use a default of: `{ skip: 0, take: 100 }`.

> Note: this example uses the `graphql-request` library, but you just need to provide a valid query which is a string.

### Creating a Signer

In order to execute a transaction on the blockchain, you need to have a signer. That is, you need to have access to an EOA (Externally Owned Account) to trigger any sort of change. You can do this through a contract, but an EOA still has to be the one which triggers the contract to interact with another contract. The signer that is returned will be passed when executing transactions.

#### Web3Provider Signer Example

Below is an example of using the `Web3Provider` object to create a signer. This will likely be the way that most client-side applications create a signer.

```ts
import { Framework } from "@superfluid-finance/sdk-core";
import Web3Modal from "web3modal";
import { Web3Provider } from "@ethersproject/providers";

// web3Modal example
const web3ModalRawProvider = await web3Modal.connect();
const web3ModalProvider = new Web3Provider(web3ModalRawProvider, "any");

const sf = await Framework.create({
  networkName: "matic",
  provider: web3ModalProvider,
});

const web3ModalSigner = sf.createSigner(web3ModalProvider);

// MetaMask example
const metamaskProvider = new Web3Provider(window.ethereum);
const metaMaskSigner = sf.createSigner(metamaskProvider);
```

#### Hardhat Signer Example

Below is an example of creating a signer in a `Hardhat` + `ethers.js` environment. This will likely be the way that the `sdk-core` is used in a testing environment.

```ts
import { Framework } from "@superfluid-finance/sdk-core";
import { ethers } from "hardhat";

const sf = await Framework.create({
  networkName: "matic",
  provider: ethers.provider,
});

const signer = sf.createSigner({
  privateKey: "<TEST_ACCOUNT_PRIVATE_KEY>",
  provider: ethers.provider,
});
```

#### Signer/Wallet Example

Below is an example of creating a signer passing in a signer object (this can be a wallet for example). This will likely be the way that the `sdk-core` is used in a Node.js environment (back-end) or a testing environment.

```ts
import { Framework } from "@superfluid-finance/sdk-core";
import { ethers } from "ethers";

const provider = new ethers.providers.InfuraProvider(
  "matic",
  "<INFURA_API_KEY>"
);

const wallet = new ethers.Wallet(
  "cf2bea4c6aad8dbc387d5dd68bf408999b0b1ee949e04ff1d96dd60bc3553a49",
  provider
);

const sf = await Framework.create({
  networkName: "matic",
  provider,
});

const signer = sf.createSigner({
  signer: wallet
});
```

### Operation

The `Operation` class is an object that is returned after you execute a contract call from this package - instead of immediately executing, we return the `Operation` class which can be either executed to broadcast the transaction or used to create and execute a `BatchCall`.

#### Usage

```ts
import { Framework } from "@superfluid-finance/sdk-core";
import { ethers } from "ethers";

const provider = new ethers.providers.InfuraProvider(
  "matic",
  "<INFURA_API_KEY>"
);

const sf = await Framework.create({
  networkName: "matic",
  provider
});

// create a signer
const signer = sf.createSigner({ privateKey: "<TEST_ACCOUNT_PRIVATE_KEY>", provider });

// load the usdcx SuperToken via the Framework
const usdcx = sf.loadToken("0xCAa7349CEA390F89641fe306D93591f87595dc1F");

// create an approve operation
const approveOperation = usdcx.approve("0xab...", ethers.utils.parseUnits("100"));

// execute the approve operation, passing in a signer
const txn = await approveOperation.exec(signer);

// wait for the transaction to be confirmed
const receipt = await txn.wait();

// or you can create and execute the transaction in a single line
const approveTxn = await usdcx.approve("0xab...", ethers.utils.parseUnits("100")).exec(signer);
const approveTxnReceipt = await approveTxn.wait();
```

### ConstantFlowAgreementV1

The `ConstantFlowAgreementV1` helper class provides access to create/update/delete flows. You can access this via the `Framework` class (`sf.cfaV1`) or initialize this as a standalone class.

#### Direct Initialization

```ts
import { ConstantFlowAgreementV1 } from "@superfluid-finance/sdk-core";

const config = {
  hostAddress: "0x3E14dC1b13c488a8d5D310918780c983bD5982E7",
  superTokenFactoryAddress: "0x2C90719f25B10Fc5646c82DA3240C76Fa5BcCF34",
  cfaV1Address: "0x6EeE6060f715257b970700bc2656De21dEdF074C",
  idaV1Address: "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1"
};

const cfaV1 = new ConstantFlowAgreementV1({ options: config });
```

#### CFAV1 Functions
```ts
// read
await sf.cfaV1.getFlow({ superToken: string, sender: string, receiver: string, providerOrSigner: ethers.providers.Provider | ethers.Signer });
await sf.cfaV1.getAccountFlowInfo({ superToken: string, account: string, providerOrSigner: ethers.providers.Provider | ethers.Signer });
await sf.cfaV1.getNetFlow({ superToken: string, account: string, providerOrSigner: ethers.providers.Provider | ethers.Signer });

// write
await sf.cfaV1.createFlow({ sender: string, receiver: string, token: string, flowRate: string, userData?: string });
await sf.cfaV1.updateFlow({ sender: string, receiver: string, token: string, flowRate: string, userData?: string });
await sf.cfaV1.deleteFlow({ sender: string, receiver: string, token: string, userData?: string });
```

### InstantDistributionAgreementV1

The `InstantDistributionAgreementV1` helper class provides access to a variety of IDA functions. You can access this via the `Framework` class (`sf.idaV1`) or initialize this as a standalone class.

#### Direct Initialization

```ts
import { InstantDistributionAgreementV1 } from "@superfluid-finance/sdk-core";

const config = {
  hostAddress: "0x3E14dC1b13c488a8d5D310918780c983bD5982E7",
  superTokenFactoryAddress: "0x2C90719f25B10Fc5646c82DA3240C76Fa5BcCF34",
  idaV1Address: "0x6EeE6060f715257b970700bc2656De21dEdF074C",
  idaV1Address: "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1"
};

const idaV1 = new InstantDistributionAgreementV1({ options: config });
```

#### IDAV1 Functions
```ts
// read
await sf.idaV1.getSubscription({ superToken: string, publisher: string, indexId: string, subscriber: string, providerOrSigner: string });
await sf.idaV1.getIndex({ superToken: string, publisher: string, indexId: string, providerOrSigner: string });

// write
await sf.idaV1.createIndex({ indexId: string, userData: string });
await sf.idaV1.distribute({ indexId: string, amount: string, userData: string });
await sf.idaV1.updateIndexValue({ indexId: string, indexValue: string, userData: string });
await sf.idaV1.updateSubscriptionUnits({ indexId: string, subscriber: string, units: string, userData: string });
await sf.idaV1.approveSubscription({ indexId: string, subscriber: string, userData: string });
await sf.idaV1.revokeSubscription({ indexId: string, subscriber: string, userData: string });
await sf.idaV1.deleteSubscription({ indexId: string, subscriber: string, publisher: string, userData: string });
await sf.idaV1.claim({ indexId: string, subscriber: string, publisher: string, userData: string });
```

### SuperToken

The `SuperToken` class can also be accessed via the `Framework` class and allows you read from/write to the blockchain. It also provides write functions for both the CFAV1 and IDAV1 contracts in the context of the token. That is, the token field for these different methods will be the token address specified during the creation of this class.

#### Framework based initialization

```ts
import { Framework } from "@superfluid-finance/sdk-core";
import { ethers } from "ethers";

const provider = new ethers.providers.InfuraProvider(
  "matic",
  "<INFURA_API_KEY>"
);

const sf = await Framework.create({
  networkName: "matic",
  provider
});

const usdcx = sf.loadToken("0xCAa7349CEA390F89641fe306D93591f87595dc1F");
```

#### Direct Initialization

```ts
import { SuperToken } from "@superfluid-finance/sdk-core";
import { ethers } from "ethers";

const provider = new ethers.providers.InfuraProvider(
  "matic",
  "<INFURA_API_KEY>"
);
let usdcx: SuperToken;

const config = {
  hostAddress: "0x3E14dC1b13c488a8d5D310918780c983bD5982E7",
  superTokenFactoryAddress: "0x2C90719f25B10Fc5646c82DA3240C76Fa5BcCF34",
  cfaV1Address: "0x6EeE6060f715257b970700bc2656De21dEdF074C",
  idaV1Address: "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1"
};

usdcx = await SuperToken.create({
  address: "0xCAa7349CEA390F89641fe306D93591f87595dc1F",
  config,
  networkName: "matic",
  provider
});
```

#### SuperToken Functions

```ts
const usdcx = sf.loadToken("0xCAa7349CEA390F89641fe306D93591f87595dc1F");

// SuperToken Read Functions
// ERC20 `Token` function
await usdcx.balanceOf({ account: string, providerOrSigner: ethers.providers.Provider | ethers.Signer }); // Inherited ERC20 function
await usdcx.allowance({ owner: string, spender: string, providerOrSigner: ethers.providers.Provider | ethers.Signer }); // Inherited ERC20 function
await usdcx.totalSupply({ providerOrSigner: ethers.providers.Provider | ethers.Signer }); // Inherited ERC20 function

// `SuperToken` only function
await usdcx.realtimeBalanceOf({ account: string, timestamp: string, providerOrSigner: ethers.providers.Provider | ethers.Signer });

// Write Functions
// All write functions return Promise<Operation>

// SuperToken Write Functions
await usdcx.approve({ recipient: string, amount: string });
await usdcx.downgrade({ amount: string });
await usdcx.transfer({ recipient: string, amount: string });
await usdcx.transferFrom({ sender: string, recipient: string, amount: string });
await usdcx.upgrade({ amount: string });

// SuperToken CFAV1/IDAV1 Functions are the same as the
// ConstantFlowAgreementV1/InstantDistributionAgreementV1 class functions
// except instead of the sf.cfaV1/idaV1.function() signature, it is token.function()
// and you don't need to pass in a token as a parameter as it uses the token address
// of the instantiated class.
```

> Note: you can also get the underlying Token object which only has ERC20 token read/write methods-this is useful for things like approving token spend to a SuperToken contract prior to upgrading for example.

```ts
const usdc = usdcx.underlyingToken;
const totalSupply = await usdc.totalSupply();
```

### Batch Call

The `BatchCall` class allows the user to batch multiple supported operations/transactions in one operation. Similar to the other helper classes, we can create this either through the `Framework` or directly initialize this.

#### Supported Operations

Not all operations are supported by the batch call feature, below is a list of the supported operations:

- ERC20_APPROVE (SuperToken only)
- ERC20_TRANSFER_FROM
- SUPERTOKEN_UPGRADE
- SUPERTOKEN_DOWNGRADE
- SUPERFLUID_CALL_AGREEMENT
- CALL_APP_ACTION

Most of the token methods are self explanatory, but some additional context for the last two operations is helpful.
`SUPERFLUID_CALL_AGREEMENT` refers to all operations related to the CFA or IDA (`createFlow`, `updateIndex`, `distribute`, etc.).
`CALL_APP_ACTION` refers to an operation which is created from calling a function that exists on a super app you have created. Refer to Usage below to see how you can create a `CALL_APP_ACTION` operation.

#### Framework based initialization

```ts
import { Framework } from "@superfluid-finance/sdk-core";
import { ethers } from "ethers";

const provider = new ethers.providers.InfuraProvider(
  "matic",
  "<INFURA_API_KEY>"
);

const sf = await Framework.create({
  networkName: "matic",
  provider
});

const signer = sf.createSigner({ privateKey: "<TEST_ACCOUNT_PRIVATE_KEY>", provider });
const batchCall = sf.batchCall([<OPERATION_A>, <OPERATION_B>, ...]);
```

#### Direct Initialization

```ts
import { SuperToken } from "@superfluid-finance/sdk-core";

const config = {
  hostAddress: "0x3E14dC1b13c488a8d5D310918780c983bD5982E7",
  superTokenFactoryAddress: "0x2C90719f25B10Fc5646c82DA3240C76Fa5BcCF34",
  cfaV1Address: "0x6EeE6060f715257b970700bc2656De21dEdF074C",
  idaV1Address: "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1"
};

const batchCall = new BatchCall({
  config,
  operations: [<OPERATION_A>, <OPERATION_B>, ...],
});
```

#### Usage

```ts
const txn = await batchCall.execute(signer);

// creating an operation from a super app function
// initialize your super app contract
const superApp = new ethers.Contract("0x...", <SUPER_APP_ABI>);

// populate the transaction
const superAppTransactionPromise = superApp.populateTransaction.helloWorld("hello world");

// create the super app operation you can execute this operation directly or pass it in to a batch call
const superAppOperation = new Operation(superAppOperation, "CALL_APP_ACTION");
```
