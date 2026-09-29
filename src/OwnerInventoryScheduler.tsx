import React from 'react';

// VYRON 5.0.1: owner inventory is cache-first and manual-only.
// No cold-start timer, OAuth-triggered refresh or TTL polling is allowed.
export const OWNER_INVENTORY_COLD_START_DELAY_MS=0;
export const OWNER_INVENTORY_OAUTH_DEBOUNCE_MS=0;

export function OwnerInventoryScheduler(){
  return null;
}
