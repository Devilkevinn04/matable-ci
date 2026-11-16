UPDATE shops
SET merchant_verification_status = CASE identity_verification_status
      WHEN 'approved' THEN 'verified'
      WHEN 'under_review' THEN 'under_review'
      WHEN 'action_required' THEN 'rejected'
      WHEN 'rejected' THEN 'rejected'
      ELSE 'pending'
    END
WHERE identity_verification_method = 'manual';

UPDATE merchant_verification_documents
SET expires_at = CURRENT_TIMESTAMP
WHERE document_type IN ('storefront', 'interior', 'products')
  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);
