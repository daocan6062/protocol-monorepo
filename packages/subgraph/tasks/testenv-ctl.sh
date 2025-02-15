#!/bin/bash

# make sure that if any step fails, the script fails
set -xe

CMD=$1

if [ "$CMD" == "start" ];then
    # Generate Typechain files and move to subgraph directory
    cd ../ethereum-contracts
    # Install contract dependencies and build contracts
    yarn install
    yarn run build:contracts
    # Generate and move typechain to subgraph folder
    rm -rf typechain
    yarn run generate-ethers-types
    mv typechain ../subgraph
    cd ../js-sdk
    # Get abi.js file for js-sdk to deploy locally
    chmod +x ./tasks/build-abi-js.sh
    ./tasks/build-abi-js.sh
    cd ../subgraph
    # Install subgraph dependencies
    yarn install
    # Deploy contracts and token locally
    yarn deploy-contracts-local
    # Prepare, set network, build and deploy subgraph locally
    yarn build-and-deploy-local
elif [ "$CMD" == "stop" ];then
    cd ../sdk-core
    ./tasks/startGanacheAndDeployContracts.sh $CMD
fi
