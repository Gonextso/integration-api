export default {
  updateEmailConsent: `
mutation UpdateCustomerEmailConsent($input: CustomerEmailMarketingConsentUpdateInput!) {
  customerEmailMarketingConsentUpdate(input: $input) {
    customer {
      id
      email
      emailMarketingConsent {
        marketingState
        consentUpdatedAt
      }
    }
    userErrors {
      field
      message
    }
  }
}`,
  updateSmsConsent: `
mutation UpdateCustomerSmsConsent($input: CustomerSmsMarketingConsentUpdateInput!) {
  customerSmsMarketingConsentUpdate(input: $input) {
    customer {
      id
      phone
      smsMarketingConsent {
        marketingState
        consentUpdatedAt
      }
    }
    userErrors {
      field
      message
    }
  }
}`,
};
