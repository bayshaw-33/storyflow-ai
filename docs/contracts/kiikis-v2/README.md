# KIIKIS 2.0 public contracts

Contract version: `2.0.0-alpha.1`

The TypeScript definitions in `lib/contracts/v2/` are the public DTO boundary
for KIIKIS 2.0. They are shared by server adapters, API routes, fixtures, and
UI clients. A consumer may depend on these definitions without depending on
the Supabase schema.

## Compatibility

- Additive changes may remain on the current alpha contract only when existing
  field meanings and required fields remain unchanged.
- Removing a field, changing its type or meaning, changing a lifecycle value,
  or changing an error-code meaning is a breaking change.
- Breaking changes must update `CONTRACT_VERSION` and require a new contract
  fixture/test set. `assertContractVersion` rejects any other version.
- Server adapters may contain database row names, storage paths, provider
  metadata, prompts, and internal identifiers; those values must not be
  exported by the public DTOs.

## Fixture contract

`tests/fixtures/kiikis-v2/` contains `normal`, `empty`, and `errors` fixtures
for every core object. The fixtures are intentionally small and deterministic
so frontend and backend tasks can use them without a live database.
