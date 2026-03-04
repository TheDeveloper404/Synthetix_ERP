/**
 * Azure Cache for Redis
 * - C1 Standard (1GB) in prod, C0 Basic (250MB) in dev/staging
 * - TLS enforced (port 6380 only)
 * - Non-SSL port disabled
 */

param name string
param location string
param env string

var isProd = env == 'prod'

resource redisCache 'Microsoft.Cache/redis@2023-08-01' = {
  name: name
  location: location
  properties: {
    sku: {
      name: isProd ? 'Standard' : 'Basic'
      family: 'C'
      capacity: isProd ? 1 : 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    redisConfiguration: {
      maxmemoryPolicy: 'allkeys-lru'
    }
  }
  tags: {
    environment: env
    application: 'synthetix'
  }
}

// rediss:// scheme triggers TLS in ioredis
output connectionString string = 'rediss://:${redisCache.listKeys().primaryKey}@${redisCache.properties.hostName}:6380'
output hostName string = redisCache.properties.hostName
