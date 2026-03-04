/**
 * Azure Container Registry
 * - SKU: Basic (dev/staging) / Standard (prod)
 * - Admin account enabled for CI/CD simplicity
 * - Free tier: first 10 GB storage included
 * - Cost: ~$0 (Basic, < 10GB) to ~$5/month (Standard)
 */

param name string
param location string
param env string

var isProd = env == 'prod'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: replace(name, '-', '') // ACR names cannot contain hyphens
  location: location
  sku: {
    name: isProd ? 'Standard' : 'Basic'
  }
  properties: {
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: isProd ? 'Enabled' : 'Disabled'
  }
  tags: {
    environment: env
    application: 'synthetix'
  }
}

output loginServer string = registry.properties.loginServer
output name string = registry.name
output id string = registry.id
