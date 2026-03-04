/**
 * Azure Cosmos DB for MongoDB API
 * - Serverless capacity (no fixed throughput cost)
 * - Zone redundancy in prod
 * - Automatic failover disabled (single region for simplicity)
 */

param name string
param location string
param databaseName string
param env string

var isProd = env == 'prod'

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2023-09-15' = {
  name: name
  location: location
  kind: 'MongoDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    apiProperties: {
      serverVersion: '7.0'
    }
    capabilities: [
      { name: 'EnableMongo' }
      { name: 'EnableServerless' }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: isProd
      }
    ]
    backupPolicy: {
      type: isProd ? 'Continuous' : 'Periodic'
      continuousModeProperties: isProd ? {
        tier: 'Continuous7Days'
      } : null
    }
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    environment: env
    application: 'synthetix'
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases@2023-09-15' = {
  parent: cosmos
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

// Outputs the primary MongoDB connection string
output connectionString string = cosmos.listConnectionStrings().connectionStrings[0].connectionString
output accountName string = cosmos.name
output databaseName string = database.name
