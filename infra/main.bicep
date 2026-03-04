/**
 * Synthetix ERP — Azure Infrastructure (main.bicep)
 *
 * Always deployed:
 *   - Azure Container Registry (ACR) — free under 10 GB
 *   - Azure Cosmos DB for MongoDB API — serverless, pay per use
 *   - Azure Key Vault — ~$0/month
 *   - Azure Communication Services (email) — pay per email
 *   - Azure Container Apps (backend) — consumption, scales to zero
 *
 * Optional (default: false — enable when ready for production):
 *   - deployRedis      → Azure Cache for Redis Basic C0 (~$16/month)
 *   - deployFrontDoor  → Azure Front Door Standard + WAF (~$35-50/month)
 *
 * Usage:
 *   az deployment sub create \
 *     --location eastus \
 *     --template-file infra/main.bicep \
 *     --parameters @infra/main.parameters.json
 *
 * To enable optional services for production:
 *   --parameters deployRedis=true deployFrontDoor=true
 */

targetScope = 'subscription'

// ============= PARAMETERS =============
@description('Environment name: dev, staging, prod')
@allowed(['dev', 'staging', 'prod'])
param env string = 'prod'

@description('Azure region for all resources')
param location string = 'eastus'

@description('Base name for all resources (e.g. synthetix)')
param baseName string = 'synthetix'

@description('Container image to deploy (e.g. myregistry.azurecr.io/synthetix:latest)')
param containerImage string

@description('JWT secret — stored in Key Vault')
@secure()
param jwtSecret string

@description('OpenAI API key — stored in Key Vault')
@secure()
param openaiApiKey string

@description('OpenAI base URL')
param openaiBaseUrl string = 'https://api.openai.com/v1'

@description('Public base URL of the frontend')
param nextPublicBaseUrl string

@description('Allowed CORS origins (comma-separated)')
param corsOrigins string

@description('Stripe secret key — leave empty until billing is configured')
@secure()
param stripeSecretKey string = ''

@description('Stripe webhook secret — leave empty until billing is configured')
@secure()
param stripeWebhookSecret string = ''

@description('Deploy Azure Cache for Redis (~$16/month Basic C0). Enables precise rate-limiting and server-side JWT logout.')
param deployRedis bool = false

@description('Deploy Azure Front Door Standard + WAF (~$35-50/month). Enables CDN, DDoS protection, and OWASP WAF rules.')
param deployFrontDoor bool = false

// ============= VARIABLES =============
var resourceGroupName = 'rg-${baseName}-${env}'
var uniqueSuffix = uniqueString(subscription().subscriptionId, env, baseName)
var shortSuffix = substring(uniqueSuffix, 0, 8)

// ============= RESOURCE GROUP =============
resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: resourceGroupName
  location: location
}

// ============= ALWAYS-ON MODULES =============

module acr 'modules/acr.bicep' = {
  name: 'acr'
  scope: rg
  params: {
    name: 'acr-${baseName}-${shortSuffix}'
    location: location
    env: env
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  scope: rg
  params: {
    name: 'kv-${baseName}-${shortSuffix}'
    location: location
    env: env
  }
}

module cosmosDb 'modules/cosmos.bicep' = {
  name: 'cosmos'
  scope: rg
  params: {
    name: 'cosmos-${baseName}-${shortSuffix}'
    location: location
    databaseName: baseName
    env: env
  }
}

module acs 'modules/acs.bicep' = {
  name: 'acs'
  scope: rg
  params: {
    name: 'acs-${baseName}-${shortSuffix}'
    location: location
    env: env
  }
}

// ============= OPTIONAL: REDIS (~$16/month — enable with deployRedis=true) =============
module redis 'modules/redis.bicep' = if (deployRedis) {
  name: 'redis'
  scope: rg
  params: {
    name: 'redis-${baseName}-${shortSuffix}'
    location: location
    env: env
  }
}

// ============= CONTAINER APP =============
module containerApp 'modules/containerapp.bicep' = {
  name: 'containerapp'
  scope: rg
  params: {
    name: 'ca-${baseName}-${env}'
    location: location
    env: env
    containerImage: containerImage
    mongoUrl: cosmosDb.outputs.connectionString
    #disable-next-line BCP188
    redisUrl: deployRedis ? redis.outputs.connectionString : ''
    acsConnectionString: acs.outputs.connectionString
    acsFromEmail: acs.outputs.senderEmail
    jwtSecret: jwtSecret
    openaiApiKey: openaiApiKey
    openaiBaseUrl: openaiBaseUrl
    nextPublicBaseUrl: nextPublicBaseUrl
    corsOrigins: corsOrigins
    stripeSecretKey: stripeSecretKey
    stripeWebhookSecret: stripeWebhookSecret
    keyVaultName: keyVault.outputs.name
  }
}

// ============= OPTIONAL: FRONT DOOR + WAF (~$35-50/month — enable with deployFrontDoor=true) =============
module frontDoor 'modules/frontdoor.bicep' = if (deployFrontDoor) {
  name: 'frontdoor'
  scope: rg
  params: {
    name: 'afd-${baseName}-${shortSuffix}'
    location: 'global'
    env: env
    backendHostName: containerApp.outputs.fqdn
  }
}

// ============= KEY VAULT SECRETS =============
module kvSecrets 'modules/kvsecrets.bicep' = {
  name: 'kvsecrets'
  scope: rg
  params: {
    keyVaultName: keyVault.outputs.name
    jwtSecret: jwtSecret
    openaiApiKey: openaiApiKey
    mongoConnectionString: cosmosDb.outputs.connectionString
    #disable-next-line BCP188
    redisConnectionString: deployRedis ? redis.outputs.connectionString : ''
    acsConnectionString: acs.outputs.connectionString
    stripeSecretKey: stripeSecretKey
    stripeWebhookSecret: stripeWebhookSecret
  }
  dependsOn: [keyVault, cosmosDb]
}

// ============= OUTPUTS =============
output resourceGroupName string = rg.name
output containerAppFqdn string = containerApp.outputs.fqdn
output keyVaultName string = keyVault.outputs.name
output acrLoginServer string = acr.outputs.loginServer
#disable-next-line BCP188
output frontDoorEndpoint string = deployFrontDoor ? frontDoor.outputs.endpoint : 'Front Door not deployed (set deployFrontDoor=true to enable)'
output redisDeployed bool = deployRedis
output frontDoorDeployed bool = deployFrontDoor
