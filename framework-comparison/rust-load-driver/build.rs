fn main() {
    let compiler = std::env::var("RUSTC").unwrap_or_else(|_| "rustc".into());
    let output = std::process::Command::new(compiler)
        .arg("--version")
        .output()
        .expect("rustc identity");
    assert!(output.status.success());
    println!(
        "cargo:rustc-env=EXACT_RUSTC_VERSION={}",
        String::from_utf8(output.stdout).unwrap().trim()
    );
}
