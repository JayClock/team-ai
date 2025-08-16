export interface Entity<Identity, Description> {
  getIdentity(): Identity;

  getDescription(): Description;
}
