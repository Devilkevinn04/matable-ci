import { lazy } from 'react';

export const MerchantIdentityVerification = lazy(() =>
  import('./MerchantIdentityVerification').then(({ MerchantIdentityVerification }) => ({
    default: MerchantIdentityVerification,
  })),
);
