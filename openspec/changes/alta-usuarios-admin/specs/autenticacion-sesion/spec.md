# specs/autenticacion-sesion/spec.md (delta)

## REMOVED Requirements

### Requirement: Registro público
**Reason**: el registro público se cierra; la creación de usuarios con rol vive en
`/usuarios` y es exclusiva de ADMIN (`gestion-usuarios`, fase B). Mantener `/registro`
dejaría una vía de alta contra un endpoint que ya exige `ROLE_ADMIN`.

**Migration**: retirar la ruta `/registro`, `register-page.tsx` y la mutación `register`
de `auth-api.ts`; el login deja de ofrecer "Regístrate". No hay migración de datos: las
cuentas existentes siguen operando y el primer ADMIN nace del seed Flyway del back.
