{
  description = "pimpumpam — a REST application that is a full CalDAV and CardDAV client";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    pyproject-nix = {
      url = "github:pyproject-nix/pyproject.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    uv2nix = {
      url = "github:pyproject-nix/uv2nix";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    pyproject-build-systems = {
      url = "github:pyproject-nix/build-system-pkgs";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.uv2nix.follows = "uv2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      uv2nix,
      pyproject-nix,
      pyproject-build-systems,
      ...
    }:
    let
      inherit (nixpkgs) lib;

      forAllSystems = lib.genAttrs [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      # Load the uv workspace (pyproject.toml + uv.lock) from this directory.
      workspace = uv2nix.lib.workspace.loadWorkspace { workspaceRoot = ./.; };

      # Prefer prebuilt wheels so native deps (lxml, ...) are not
      # compiled from source under Nix.
      overlay = workspace.mkPyprojectOverlay {
        sourcePreference = "wheel";
      };

      # Per-package build fixups would go here if any wheel needs patching.
      pyprojectOverrides = _final: _prev: { };

      pythonSets = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          python = pkgs.python312;
        in
        (pkgs.callPackage pyproject-nix.build.packages { inherit python; }).overrideScope (
          lib.composeManyExtensions [
            pyproject-build-systems.overlays.default
            overlay
            pyprojectOverrides
          ]
        )
      );
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};

          # The Python REST server: a virtualenv with pimpumpam + runtime deps,
          # exposing bin/pimpumpam and bin/python.
          server = pythonSets.${system}.mkVirtualEnv "pimpumpam-env" workspace.deps.default;

          # The frontend, built with the nixpkgs pnpm infrastructure (no manual
          # pnpm build). $out is the dist/ directory (contains index.html).
          ui = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "pimpumpam-ui";
            version = "0.1.0";
            src = ./ui;
            nativeBuildInputs = [
              pkgs.nodejs_22
              pkgs.pnpm
              pkgs.pnpmConfigHook
            ];
            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs) pname version src;
              fetcherVersion = 3;
              hash = "sha256-Z6YW4fi1OmmEKmBpT86eUjpXfd9M8o5gOi/cpjQGSzI=";
            };
            buildPhase = ''
              runHook preBuild
              pnpm build
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              cp -r dist $out
              runHook postInstall
            '';
          });

          # `nix run .#ui`: start the REST backend serving the built UI, and
          # print the URL.
          ui-server = pkgs.writeShellApplication {
            name = "pimpumpam-ui";
            runtimeInputs = [ server ];
            text = ''
              export PIMPUMPAM_STATIC_DIR=${ui}
              export PIMPUMPAM_HOST="''${PIMPUMPAM_HOST:-127.0.0.1}"
              export PIMPUMPAM_PORT="''${PIMPUMPAM_PORT:-8000}"
              echo ""
              echo "  ▶ pimpumpam is running at  http://''${PIMPUMPAM_HOST}:''${PIMPUMPAM_PORT}"
              echo ""
              exec pimpumpam
            '';
          };
          # `nix run .#desktop`: the Electron app, bundling the Python backend
          # (which serves the UI). Spawns the server and opens a window onto it.
          desktop = pkgs.writeShellApplication {
            name = "pimpumpam-desktop";
            runtimeInputs = [
              pkgs.electron
              server
            ];
            text = ''
              export PIMPUMPAM_SERVER_BIN="${server}/bin/pimpumpam"
              export PIMPUMPAM_STATIC_DIR="${ui}"
              exec electron ${./electron} "$@"
            '';
          };

          # `nix build .#e2e-videos`: run the Playwright E2E recording a video of
          # every test against a built UI + backend + Radicale, all inside the
          # sandbox. $out holds the .webm recordings.
          e2e-videos = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "pimpumpam-e2e-videos";
            version = "0.1.0";
            src = ./ui;
            nativeBuildInputs = [
              pkgs.nodejs_22
              pkgs.pnpm
              pkgs.pnpmConfigHook
              server # provides bin/python with pimpumpam + uvicorn
              pkgs.radicale # standalone DAV server for the stack
              pkgs.cacert # a valid CA bundle (httpx reads SSL_CERT_FILE eagerly)
            ];
            # pname pinned to the UI's so this shares the UI's fetched deps.
            pnpmDeps = pkgs.fetchPnpmDeps {
              pname = "pimpumpam-ui";
              inherit (finalAttrs) version src;
              fetcherVersion = 3;
              hash = "sha256-Z6YW4fi1OmmEKmBpT86eUjpXfd9M8o5gOi/cpjQGSzI=";
            };
            PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
            RADICALE_CMD = "${pkgs.radicale}/bin/radicale";
            buildPhase = ''
              runHook preBuild
              export HOME="$TMPDIR"
              export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
              # Chromium/Skia need a fontconfig + at least one font to render text.
              export FONTCONFIG_FILE="${pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; }}"
              pnpm build
              export E2E_VIDEO=1
              export E2E_SERVER_CMD="python e2e/stack.py"
              export E2E_SERVER_CWD="$PWD"
              export PIMPUMPAM_STATIC_DIR="$PWD/dist"
              # Records the full journey; the artifact is the video, so capture it
              # regardless of pass/fail.
              pnpm exec playwright test e2e/app.spec.ts || touch "$TMPDIR/e2e-failed"
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              find test-results -name '*.webm' -print0 | while IFS= read -r -d "" v; do
                cp "$v" "$out/$(basename "$(dirname "$v")").webm"
              done
              # Keep failure context (ARIA snapshots) for debugging.
              find test-results -name 'error-context.md' -print0 | while IFS= read -r -d "" e; do
                cp "$e" "$out/$(basename "$(dirname "$e")").error.md"
              done
              [ -f "$TMPDIR/e2e-failed" ] && echo "some tests failed" > "$out/STATUS" || echo "all passed" > "$out/STATUS"
              runHook postInstall
            '';
          });
        in
        {
          default = server;
          server = server;
          ui = ui;
          ui-server = ui-server;
          desktop = desktop;
          e2e-videos = e2e-videos;
        }
      );

      apps = forAllSystems (system: {
        # `nix run` -> the REST server alone (API only).
        default = {
          type = "app";
          program = "${self.packages.${system}.server}/bin/pimpumpam";
        };
        # `nix run .#ui` -> backend + built UI on one URL.
        ui = {
          type = "app";
          program = lib.getExe self.packages.${system}.ui-server;
        };
        # `nix run .#desktop` -> the Electron desktop app.
        desktop = {
          type = "app";
          program = lib.getExe self.packages.${system}.desktop;
        };
      });

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          python = pkgs.python312;
          pythonSet = pythonSets.${system};
        in
        {
          # Fast, impure shell: plain uv against the system Python, plus the
          # Node/pnpm toolchain for the `ui/` frontend.
          impure = pkgs.mkShell {
            packages = [
              python
              pkgs.uv
              pkgs.nodejs_22
              pkgs.pnpm
            ];
            env = {
              UV_PYTHON_DOWNLOADS = "never";
              UV_PYTHON = python.interpreter;
            };
            shellHook = ''
              unset PYTHONPATH
            '';
          };

          # Reproducible editable shell built from the locked dependency set.
          default =
            let
              editableOverlay = workspace.mkEditablePyprojectOverlay {
                root = "$REPO_ROOT";
              };

              editablePythonSet = pythonSet.overrideScope (
                lib.composeManyExtensions [
                  editableOverlay
                  (final: prev: {
                    pimpumpam = prev.pimpumpam.overrideAttrs (old: {
                      src = lib.fileset.toSource {
                        root = old.src;
                        fileset = lib.fileset.unions [
                          (old.src + "/pyproject.toml")
                          (old.src + "/README.md")
                          (old.src + "/src")
                        ];
                      };
                      nativeBuildInputs =
                        old.nativeBuildInputs
                        ++ final.resolveBuildSystem { editables = [ ]; };
                    });
                  })
                ]
              );

              virtualenv = editablePythonSet.mkVirtualEnv "pimpumpam-dev-env" workspace.deps.all;
            in
            pkgs.mkShell {
              packages = [
                virtualenv
                pkgs.uv
                pkgs.nodejs_22
                pkgs.pnpm
              ];
              env = {
                UV_NO_SYNC = "1";
                UV_PYTHON = "${virtualenv}/bin/python";
                UV_PYTHON_DOWNLOADS = "never";
              };
              shellHook = ''
                unset PYTHONPATH
                export REPO_ROOT=$(git rev-parse --show-toplevel)
              '';
            };
        }
      );
    };
}
