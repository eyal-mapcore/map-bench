#! /bin/bash

##########################################################################################
## Install MapCore Web SDK
##########################################################################################
VERSION=$1

if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    exit 1
fi

JFROG_USERNAME='mapcore'

if [ -z "$JFROG_TOKEN" ]; then
    echo "JFROG_TOKEN is not set - please obtain a token from MapCore's JFrog repository and set the JFROG_TOKEN environment variable"
    exit 1
fi

mkdir -p tmp/mapcore-install
npm login --registry=https://mapcore.jfrog.io/artifactory/api/npm/npm/ --auth-type=web --scope=@mapcore --username=$JFROG_USERNAME --password=$JFROG_TOKEN
npm install --prefix=tmp/mapcore-install MapCore_32@$VERSION --registry=https://mapcore.jfrog.io/artifactory/api/npm/npm/
rm -f public/package/*
mv tmp/mapcore-install/node_modules/MapCore_32/MapCore* public/package/.
mv public/package/MapCore.d.ts src/types/MapCore.d.ts
rm -rf tmp

echo "MapCore Web $VERSION installed successfully"



