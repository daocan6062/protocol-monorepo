import { Framework } from '@superfluid-finance/js-sdk/src/Framework';

import {DAppSDK} from "./DAppSDK";
import { dappSdkStore } from './store';

export const createDAppSDK = (superfluidSdk: Framework): DAppSDK => {
    return {
        reduxStore: dappSdkStore,
        superfluidSdk: superfluidSdk,
    };
};
