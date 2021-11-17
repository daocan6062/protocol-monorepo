import { ILightEntity } from "../test/interfaces";

export interface IBaseEntity {
    readonly id: string;
    readonly createdAtTimestamp: string;
}

export interface ILightStreamAccount extends ILightEntity {
    readonly accountTokenSnapshots: IDataIntegrityAccountTokenSnapshot[];
}

export interface IDataIntegrityStream extends IBaseEntity {
    readonly updatedAtTimestamp: string;
    readonly currentFlowRate: string;
    readonly token: ILightEntity;
    readonly sender: ILightStreamAccount;
    readonly receiver: ILightStreamAccount;
}

export interface IDataIntegrityIndexSubscription {
    readonly units: string;
    readonly approved: boolean;
}

export interface IDataIntegrityIndex extends IBaseEntity {
    readonly indexId: string;
    readonly indexValue: string;
    readonly totalUnitsPending: string;
    readonly totalUnitsApproved: string;
    readonly totalUnits: string;
    readonly token: ILightEntity;
    readonly publisher: ILightEntity;
    readonly subscriptions: IDataIntegrityIndexSubscription[];
}

export interface IDataIntegritySubscription extends IBaseEntity {
    readonly approved: boolean;
    readonly units: string;
    readonly indexValueUntilUpdatedAt: string;
    readonly subscriber: ILightEntity;
    readonly index: {
        readonly indexId: string;
        readonly indexValue: string;
        readonly token: ILightEntity;
        readonly publisher: ILightEntity;
    };
}

export interface IDataIntegrityAccountTokenSnapshot {
    readonly updatedAtTimestamp: string;
    readonly updatedAtBlockNumber: string;
    readonly totalNumberOfActiveStreams: number;
    readonly totalNumberOfClosedStreams: number;
    readonly totalSubscriptionsWithUnits: string;
    readonly totalApprovedSubscriptions: number;
    readonly balanceUntilUpdatedAt: string;
    readonly totalInflowRate: string;
    readonly totalOutflowRate: string;
    readonly totalAmountStreamedUntilUpdatedAt: string;
    readonly totalAmountTransferredUntilUpdatedAt: string;
    readonly totalNetFlowRate: string;
    readonly token: ILightEntity;
    readonly account: ILightEntity;
}
