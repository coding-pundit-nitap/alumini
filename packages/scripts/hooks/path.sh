# Sourced by lefthook (rc:) before every hook. GUI git clients such as VS Code don't read the
# interactive shell's rc files, so Node and pnpm installed through a version manager are missing
# from PATH there. Add whichever of the usual locations exist; a no-op in a normal terminal.
[ -d "${PNPM_HOME:-$HOME/.local/share/pnpm}/bin" ] && PATH="${PNPM_HOME:-$HOME/.local/share/pnpm}/bin:$PATH"
[ -d "$HOME/.volta/bin" ] && PATH="$HOME/.volta/bin:$PATH"
if [ -s "${NVM_DIR:-$HOME/.nvm}/alias/default" ]; then
  v=$(cat "${NVM_DIR:-$HOME/.nvm}/alias/default")
  case "$v" in v*) ;; *) v="v$v" ;; esac
  [ -d "${NVM_DIR:-$HOME/.nvm}/versions/node/$v/bin" ] && PATH="${NVM_DIR:-$HOME/.nvm}/versions/node/$v/bin:$PATH"
fi
command -v node >/dev/null 2>&1 || {
  [ -d "$HOME/.local/share/fnm/aliases/default/bin" ] && PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH"
}
export PATH
