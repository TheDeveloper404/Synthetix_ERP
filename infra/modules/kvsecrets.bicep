/**
 * Store application secrets in Key Vault
 */

param keyVaultName string

@secure()
param jwtSecret string

@secure()
param openaiApiKey string

@secure()
param mongoConnectionString string

@secure()
param redisConnectionString string = ''

@secure()
param acsConnectionString string

// Stripe — leave empty until billing is ready for production
@secure()
param stripeSecretKey string = ''

@secure()
param stripeWebhookSecret string = ''

resource kv 'Microsoft.KeyVault/vaults@2023-02-01' existing = {
  name: keyVaultName
}

resource secretJwt 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: kv
  name: 'jwt-secret'
  properties: { value: jwtSecret }
}

resource secretOpenAI 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: kv
  name: 'openai-api-key'
  properties: { value: openaiApiKey }
}

resource secretMongo 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: kv
  name: 'mongo-connection-string'
  properties: { value: mongoConnectionString }
}

resource secretRedis 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: kv
  name: 'redis-connection-string'
  properties: { value: redisConnectionString }
}

resource secretAcs 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: kv
  name: 'acs-connection-string'
  properties: { value: acsConnectionString }
}

// Stripe — placeholder secrets (value is empty until billing is configured for production)
resource secretStripeKey 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: kv
  name: 'stripe-secret-key'
  properties: { value: stripeSecretKey }
}

resource secretStripeWebhook 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: kv
  name: 'stripe-webhook-secret'
  properties: { value: stripeWebhookSecret }
}
