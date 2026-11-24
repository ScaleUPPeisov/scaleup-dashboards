/// Deny APEX startup until protected data, external volumes, credentials and
/// remote mutations have a verified isolation boundary. This guard runs
/// before Tauri initializes plugins, windows, or application state.
pub(crate) fn must_block_startup(_bundle_id: &str) -> bool {
    // This entire branch is experimental. A build that accidentally uses the
    // stable config is just as unsafe as one using the APEX override. Unknown
    // identifiers must fail closed too; none has a verified isolation policy.
    true
}

#[cfg(test)]
mod tests {
    use super::must_block_startup;

    #[test]
    fn every_configuration_is_blocked_until_isolation_is_verified() {
        assert!(must_block_startup("studio.channelflow.apex"));
        assert!(must_block_startup("studio.channelflow.desktop"));
        assert!(must_block_startup("studio.channelflow.unknown"));
        assert!(must_block_startup(""));
    }
}
