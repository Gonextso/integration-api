export default {
    // Live Shopify Plus gate. shop.plan.shopifyPlus is the source of truth at job time.
    plan: `
query ShopPlan {
    shop {
        plan {
            shopifyPlus
            partnerDevelopment
            displayName
        }
    }
}`,
}
