/**
 * The package contract the marketingShark room writes. B1 (quorum#568) moved every package, quiz
 * and post kinds alike, to `/2`. It lives in its own module so a reader that only needs to know
 * whether a file is a package (the social activation count) imports the version, not the package
 * schema and the studio behind it, and the two cannot drift apart again.
 */
export const MARKETINGSHARK_PACKAGE_VERSION = "marketingshark-package/2" as const;

/** Every version a drafted package has carried, oldest first. A package drafted under `/1` is still a draft. */
export const MARKETINGSHARK_PACKAGE_VERSIONS = ["marketingshark-package/1", MARKETINGSHARK_PACKAGE_VERSION] as const;
