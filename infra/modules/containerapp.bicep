/**
 * Azure Container Apps — Synthetix backend
 * - Consumption plan (scale to zero in dev)
 * - Managed identity for Key Vault access
 * - Min replicas: 1 (prod) / 0 (dev)
 */

param name string
param location string
param env string
param containerImage string

@secure()
param mongoUrl string

// Redis URL — empty string when Redis is not deployed (app falls back to MongoDB rate limiting)
@secure()
param redisUrl string = ''

@secure()
param acsConnectionString string

param acsFromEmail string

@secure()
param jwtSecret string

@secure()
param openaiApiKey string

// Stripe — empty until billing is configured for production
@secure()
param stripeSecretKey string = ''

@secure()
param stripeWebhookSecret string = ''

param openaiBaseUrl string
param nextPublicBaseUrl string
param corsOrigins string
param keyVaultName string

var isProd = env == 'prod'

// Container Apps Environment
resource env_resource 'Microsoft.App/managedEnvironments@2023-08-01-preview' = {
  name: 'cae-${name}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
  }
  tags: {
    environment: env
    application: 'synthetix'
  }
}

// Managed Identity
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${name}'
  location: location
}

// Key Vault Secrets User role for managed identity
resource kvRef 'Microsoft.KeyVault/vaults@2023-02-01' existing = {
  name: keyVaultName
}

var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kvRef
  name: guid(kvRef.id, identity.id, kvSecretsUserRoleId)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
  }
}

// Container App
resource containerApp 'Microsoft.App/containerApps@2023-08-01-preview' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: env_resource.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
      }
      secrets: [
        { name: 'mongo-url', value: mongoUrl }
        { name: 'redis-url', value: redisUrl }
        { name: 'acs-connection-string', value: acsConnectionString }
        { name: 'jwt-secret', value: jwtSecret }
        { name: 'openai-api-key', value: openaiApiKey }
        { name: 'stripe-secret-key', value: stripeSecretKey }
        { name: 'stripe-webhook-secret', value: stripeWebhookSecret }
      ]
    }
    template: {
      scale: {
        minReplicas: isProd ? 1 : 0
        maxReplicas: isProd ? 10 : 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
      containers: [
        {
          name: 'synthetix'
          image: containerImage
          resources: {
            cpu: json(isProd ? '1.0' : '0.5')
            memory: isProd ? '2Gi' : '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'MONGO_URL', secretRef: 'mongo-url' }
            { name: 'DB_NAME', value: 'synthetix' }
            { name: 'REDIS_URL', secretRef: 'redis-url' }
            { name: 'ACS_CONNECTION_STRING', secretRef: 'acs-connection-string' }
            { name: 'ACS_FROM_EMAIL', value: acsFromEmail }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
            { name: 'OPENAI_BASE_URL', value: openaiBaseUrl }
            { name: 'NEXT_PUBLIC_BASE_URL', value: nextPublicBaseUrl }
            { name: 'CORS_ORIGINS', value: corsOrigins }
            { name: 'STRIPE_SECRET_KEY', secretRef: 'stripe-secret-key' }
            { name: 'STRIPE_WEBHOOK_SECRET', secretRef: 'stripe-webhook-secret' }
            { name: 'AZURE_KEYVAULT_URL', value: kvRef.properties.vaultUri }
            { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              initialDelaySeconds: 15
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
    }
  }
  tags: {
    environment: env
    application: 'synthetix'
  }
  dependsOn: [kvRoleAssignment]
}

output fqdn string = containerApp.properties.configuration.ingress.fqdn
output name string = containerApp.name
