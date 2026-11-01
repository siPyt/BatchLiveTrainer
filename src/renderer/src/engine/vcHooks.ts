// Version Control (Course 7016 chapter 13) is consulted by the configuration stores through these hooks, so the stores need not import it
// (versionControl.ts imports them, not the other way round). With Version Control disabled every hook allows the action.
export const vcHooks: {
  /** Saving an item needs it checked out (Manual preference) or checks it out itself (Auto): an error text when the save is refused. */
  gate: (key: string) => string | null
  /** Downloading recipes: an error text when authorization or check out blocks the download. */
  downloadCheck: (recipes: string[], opts?: { proceedUnauthorized?: boolean; proceedCheckedOut?: boolean }) => string | null
  /** A save succeeded: Auto Check Out and In checks the item back in. */
  saved: (key: string) => void
} = {
  gate: () => null,
  downloadCheck: () => null,
  saved: () => {}
}
