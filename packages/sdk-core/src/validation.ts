import Ajv, { JSONSchemaType, ValidateFunction } from "ajv";
import { ethers } from "ethers";
import { IEventFilter } from ".";
import {
    IAccountTokenSnapshotFilter,
    IIndexRequestFilter,
    IIndexSubscriptionRequestFilter,
    IStreamRequestFilter,
    ISuperTokenRequestFilter,
} from "./interfaces";
import SFError from "./SFError";

const ajv = new Ajv();
ajv.addFormat("addressOrEmpty", {
    type: "string",
    validate: (x: string) => x === "" || ethers.utils.isAddress(x),
});
ajv.addFormat("stringNumber", {
    type: "string",
    validate: (x: string) => !isNaN(Number(x)),
});

// Schemas
const superTokenRequestSchema: JSONSchemaType<ISuperTokenRequestFilter> = {
    type: "object",
    additionalProperties: false,
    properties: {
        isListed: { type: "boolean", nullable: true },
    },
};
const eventRequestSchema: JSONSchemaType<IEventFilter> = {
    type: "object",
    additionalProperties: false,
    properties: {
        account: { type: "string", format: "addressOrEmpty", nullable: true },
        timestamp_gte: {
            type: "number",
            nullable: true,
        },
    },
};

const indexRequestSchema: JSONSchemaType<IIndexRequestFilter> = {
    type: "object",
    additionalProperties: false,
    properties: {
        indexId: { type: "string", format: "stringNumber", nullable: true },
        publisher: { type: "string", format: "addressOrEmpty", nullable: true },
        token: { type: "string", format: "addressOrEmpty", nullable: true },
    },
};

const accountTokenSnapshotRequestSchema: JSONSchemaType<IAccountTokenSnapshotFilter> =
    {
        type: "object",
        additionalProperties: false,
        properties: {
            account: {
                type: "string",
                format: "addressOrEmpty",
                nullable: true,
            },
            token: { type: "string", format: "addressOrEmpty", nullable: true },
        },
    };

const indexSubscriptionRequestSchema: JSONSchemaType<IIndexSubscriptionRequestFilter> =
    {
        type: "object",
        additionalProperties: false,
        properties: {
            subscriber: {
                type: "string",
                format: "stringNumber",
                nullable: true,
            },
            approved: { type: "boolean", nullable: true },
        },
    };

const streamRequestSchema: JSONSchemaType<IStreamRequestFilter> = {
    type: "object",
    additionalProperties: false,
    properties: {
        sender: { type: "string", format: "addressOrEmpty", nullable: true },
        receiver: { type: "string", format: "addressOrEmpty", nullable: true },
        token: { type: "string", format: "addressOrEmpty", nullable: true },
    },
};

function wrapValidationWithCustomError<T>(
    validateFunction: ValidateFunction<T>
) {
    return (filter: T) => {
        if (!validateFunction(filter)) {
            throw new SFError({
                type: "INVALID_OBJECT",
                customMessage: "Invalid Filter Object",
                errorObject: validateFunction.errors,
            });
        }
    };
}

// Validate functions
export const validateSuperTokenRequest = wrapValidationWithCustomError(
    ajv.compile<ISuperTokenRequestFilter>(superTokenRequestSchema)
);
export const validateEventRequest = wrapValidationWithCustomError(
    ajv.compile<IEventFilter>(eventRequestSchema)
);
export const validateIndexRequest = wrapValidationWithCustomError(
    ajv.compile<IIndexRequestFilter>(indexRequestSchema)
);
export const validateIndexSubscriptionRequest = wrapValidationWithCustomError(
    ajv.compile<IIndexSubscriptionRequestFilter>(indexSubscriptionRequestSchema)
);
export const validateStreamRequest = wrapValidationWithCustomError(
    ajv.compile<IStreamRequestFilter>(streamRequestSchema)
);
export const validateAccountTokenSnapshotRequest =
    wrapValidationWithCustomError(
        ajv.compile<IAccountTokenSnapshotFilter>(
            accountTokenSnapshotRequestSchema
        )
    );
