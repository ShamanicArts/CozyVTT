export interface AdminPasswordHasher {
  hash(password: string): Promise<string>;
}
