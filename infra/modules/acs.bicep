/**
 * Azure Communication Services
 * - Email domain: managed (azurecomm.net subdomain — no custom domain required)
 * - For production, swap managedDomain for a verified custom domain
 */

param name string
param location string
param env string

// ACS is a global resource — must deploy to specific regions
var acsLocation = (location == 'eastus' || location == 'westeurope' || location == 'australiaeast') ? location : 'unitedstates'

resource commServices 'Microsoft.Communication/communicationServices@2023-03-31' = {
  name: name
  location: 'global'
  properties: {
    dataLocation: acsLocation
  }
  tags: {
    environment: env
    application: 'synthetix'
  }
}

resource emailService 'Microsoft.Communication/emailServices@2023-03-31' = {
  name: '${name}-email'
  location: 'global'
  properties: {
    dataLocation: acsLocation
  }
  tags: {
    environment: env
    application: 'synthetix'
  }
}

// Azure-managed domain (free, no DNS setup required)
resource managedDomain 'Microsoft.Communication/emailServices/domains@2023-03-31' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

output connectionString string = commServices.listKeys().primaryConnectionString
output senderEmail string = 'DoNotReply@${managedDomain.properties.mailFromSenderDomain}'
output acsName string = commServices.name
