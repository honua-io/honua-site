# AWS installer preview

The default public build excludes this directory and has no install button.
For a local review artifact, run:

```sh
HONUA_AWS_INSTALL_PREVIEW=1 ./scripts/build-dist.sh
```

Open `dist/design-partners.html` and follow **Install in AWS (preview)**.
The install page deliberately has a disabled CloudFormation button: the public
quick-create URL and clean-account proof through sign-in and the first layer
are still pending. Do not enable this flag in the public Pages deployment.
Replace the disabled button with the approved quick-create URL and update the
prerequisites to the published template before proposing public activation.
The guide is authored in `docs/guides/deploy/aws-launch-stack/index.md`.
