#!/bin/bash
# $1 = the configuration (v1, dev, feature)
# $2 = the network

mustache="../../node_modules/mustache/bin/mustache"
graph="../../node_modules/@graphprotocol/graph-cli"

mustache config/$2.json subgraph.template.yaml > subgraph.yaml
mustache config/$2.json src/addresses.template.ts > src/addresses.ts
SUBGRAPH_NAME=superfluid-finance/protocol-$1-$2
graph deploy $SUBGRAPH_NAME --node https://api.thegraph.com/deploy/ --ipfs https://api.thegraph.com/ipfs --access-token $THEGRAPH_ACCESS_TOKEN