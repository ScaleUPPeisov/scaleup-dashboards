VYRON 2.1.6 release-blocker repair marker.

Fix set:
- UI component moved to src/ReadyVideoInventoryPanel.tsx
- Dashboard import points to ReadyVideoInventoryPanel
- old src/ReadyVideoInventory.tsx removed to eliminate case-only collision with src/readyVideoInventory.ts
- temporary CI includes case-collision guard, frontend tests/build, and Rust tests
