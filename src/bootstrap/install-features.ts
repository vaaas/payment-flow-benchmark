import type { App } from '#src/http/app';
import { installCheckoutFeature } from '#src/features/checkout/install-checkout-feature';
import { installPaymentsFeature } from '#src/features/payments/install-payments-feature';
import { installOrdersFeature } from '#src/features/orders/install-orders-feature';

export function installFeatures(app: App): App {
  return app
    .install(installCheckoutFeature)
    .install(installPaymentsFeature)
    .install(installOrdersFeature);
}
