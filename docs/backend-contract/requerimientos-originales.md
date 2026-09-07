# AthleteCore API — Documento de Requerimientos y Análisis Técnico

> **Versión:** 1.0  
> **Stack:** Java 21 · Spring Boot 3.5.6 · PostgreSQL · Vue 3  
> **Estado del proyecto:** Fase inicial (módulo de usuarios en desarrollo)

---

## 1. Requerimientos Funcionales

### RF-01 · Gestión de Deportistas
- Registrar deportistas con datos sociodemográficos (nombre, fecha de nacimiento, documento, género, contacto).
- Registrar y actualizar perfil antropométrico (peso, talla, envergadura, IMC calculado automáticamente).
- Subir y almacenar foto de perfil del deportista.
- Consultar, editar y eliminar (soft delete) deportistas.

### RF-02 · Gestión de Usuarios y Roles
- Registrar usuarios del sistema con username, email y contraseña.
- Asignar roles: **Deportista**, **Entrenador**, **Metodólogo Deportivo**, **Presidencia/Administración**.
- Autenticar usuarios mediante JWT (stateless).
- Activar o desactivar cuentas de usuario.

### RF-03 · Gestión de Entrenamientos
- Registrar sesiones de entrenamiento con fecha, hora, observaciones y estado (programada, ejecutada, cancelada).
- Organizar sesiones en la jerarquía: `Sesión → Microciclo → Mesociclo → Plan Anual`.
- Registrar por sesión: volumen (metros/repeticiones), intensidad (%), distancia, estilo/disciplina y observaciones.

### RF-04 · Control de Asistencia
- Registrar asistencia de cada deportista por sesión (presente, ausente, justificado).
- Disparar alerta automática ante N ausencias consecutivas configurables.

### RF-05 · Registro de Lesiones
- Registrar lesiones asociadas a un deportista con fecha, descripción y estado (activa, recuperada).
- Consultar historial de lesiones por deportista.

### RF-06 · Chequeos Mensuales
- Registrar el tiempo de cada deportista en una prueba (estilo + distancia) en el chequeo mensual.
- Almacenar tiempos en segundos decimales (ej. `83.45`); mostrarlos en formato `mm:ss.ms` en la UI.
- Comparar automáticamente el tiempo registrado con la tabla de tiempos nacionales de referencia.
- Asignar clasificación relativa al deportista: **Por encima del podio**, **Cercano a medallería**, **Fuera de rango**.
- Calcular y mostrar la proyección de medallería: diferencia de tiempo respecto al 1°, 2° y 3° puesto nacional.

### RF-07 · Tabla de Tiempos Nacionales de Referencia
- Administrar (CRUD) los tiempos oficiales de referencia nacional por prueba (estilo + distancia).
- Cada prueba almacena el tiempo del 1°, 2° y 3° puesto nacional.
- Accesible solo para roles con permisos administrativos (Entrenador / Metodólogo / Presidencia).

### RF-08 · Reportes
- Generar reporte individual de deportista: evolución de tiempos, asistencia, lesiones.
- Generar reporte general del equipo: comparativo de rendimiento por prueba.
- Exportar reportes en formato PDF.
- Visualizar gráficas de evolución de tiempos por deportista.

### RF-09 · Alertas Automáticas
- Alerta por ausencias consecutivas (umbral configurable).
- Alerta por descenso sostenido de intensidad en entrenamientos.
- Alerta por variación fuera de rango en indicadores antropométricos (sobrepeso / sobrecarga).

---

## 2. Requerimientos No Funcionales

### RNF-01 · Seguridad
- Autenticación stateless mediante JWT (Bearer token).
- Contraseñas almacenadas con BCrypt.
- Control de acceso basado en roles (RBAC) usando `@PreAuthorize`.
- Ningún endpoint sensible debe ser accesible sin autenticación.

### RNF-02 · Rendimiento
- Los cálculos de comparación de chequeos mensuales deben ejecutarse de forma síncrona y retornar en menos de 500ms para un equipo de hasta 50 deportistas.
- Las consultas frecuentes (listado de deportistas, sesiones por ciclo) deben estar indexadas en base de datos.

### RNF-03 · Mantenibilidad
- Arquitectura por módulos (`user`, `athlete`, `training`, `checkup`, `report`).
- Separación estricta de capas: Controller → Service → Repository.
- Nunca exponer entidades JPA directamente en respuestas HTTP; usar DTOs.
- Manejo centralizado de excepciones mediante `@RestControllerAdvice`.

### RNF-04 · Control de Esquema de Base de Datos
- El esquema de base de datos debe gestionarse mediante **migraciones Flyway** versionadas.
- Prohibido usar `ddl-auto=create` o `ddl-auto=update` en entornos que no sean desarrollo inicial.

### RNF-05 · Portabilidad
- El proyecto debe poder levantarse en local mediante Docker Compose (PostgreSQL + API).
- Configuración sensible (credenciales, secrets) gestionada mediante variables de entorno, nunca hardcodeada en el repositorio.

### RNF-06 · Extensibilidad
- El módulo de deportes/disciplinas debe ser genérico para soportar deportes distintos a natación en el futuro, sin cambios estructurales al modelo de datos.

### RNF-07 · Idioma
- El sistema opera únicamente en español. No se requiere soporte multilenguaje.

---

## 3. Recomendaciones de Corrección y Mejoras

> Las siguientes observaciones fueron identificadas durante el análisis del repositorio actual.  
> Están ordenadas por impacto. Ninguna se aplicará sin acuerdo previo.

---

### 🔴 Prioridad Alta

#### REC-01 · Entidad `User` no extiende `BaseEntity`
**Hallazgo:** `User.java` no hereda de `BaseEntity`, por lo que no tiene `createdAt`, `updatedAt` ni soft delete, contradiciendo el patrón definido en el proyecto.  
**Corrección propuesta:**
```java
public class User extends BaseEntity { ... }
```
Aplicar lo mismo a todas las entidades nuevas del dominio.

---

#### REC-02 · El Controller expone la entidad `User` directamente (incluye el hash de la contraseña)
**Hallazgo:** `UserController.getAllUsers()` y `createUser()` retornan el objeto `User` JPA. Esto serializa el campo `password` en la respuesta JSON.  
**Corrección propuesta:** Crear un DTO de respuesta y usarlo en el servicio:
```java
public record UserResponse(Long id, String username, String email,
                           String firstName, String lastName, boolean enabled) {}
```

---

#### REC-03 · Ruta `/api/v1/users/**` completamente pública
**Hallazgo:** En `SecurityConfig`, toda la ruta `/api/v1/users/**` tiene `permitAll()`, incluyendo el `GET` que lista todos los usuarios.  
**Corrección propuesta:** Limitar el acceso público únicamente a los endpoints de autenticación:
```java
.requestMatchers(HttpMethod.POST, "/api/v1/auth/register").permitAll()
.requestMatchers(HttpMethod.POST, "/api/v1/auth/login").permitAll()
.anyRequest().authenticated()
```

---

#### REC-04 · `confirmPassword` nunca se valida en el servicio
**Hallazgo:** `CreateUserRequest` tiene el método `isPasswordConfirmed()` pero `UserService.createUser()` nunca lo invoca. Las contraseñas no coincidentes se aceptan silenciosamente.  
**Corrección propuesta:** Agregar al inicio de `createUser()`:
```java
if (!request.isPasswordConfirmed()) {
    throw new IllegalArgumentException("Las contraseñas no coinciden");
}
```

---

#### REC-05 · `CreateUserRequest` no tiene `firstName` ni `lastName`
**Hallazgo:** La entidad `User` declara `firstName` y `lastName` como `NOT NULL`, pero el DTO de creación no los incluye. Esto provocaría un error de constraint en PostgreSQL al persistir.  
**Corrección propuesta:** Agregar ambos campos al DTO con sus validaciones `@NotBlank`.

---

### 🟡 Prioridad Media

#### REC-06 · Sin manejador global de excepciones
**Hallazgo:** `UserController` usa `catch (Exception e)` genérico y retorna `ResponseEntity<?>`. Esto mezcla errores de negocio con errores técnicos y dificulta el manejo consistente desde el frontend.  
**Corrección propuesta:** Crear un `GlobalExceptionHandler` con `@RestControllerAdvice`:
```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleBusiness(IllegalArgumentException ex) {
        return ResponseEntity.badRequest()
            .body(new ErrorResponse("VALIDATION_ERROR", ex.getMessage()));
    }

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(EntityNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(new ErrorResponse("NOT_FOUND", ex.getMessage()));
    }
}
```

---

#### REC-07 · Lombok declarado pero no utilizado en `User` y `Role`
**Hallazgo:** `User.java` tiene ~50 líneas de getters y setters manuales. `Role.java` no tiene ninguno. Lombok ya está como dependencia en el `pom.xml`.  
**Corrección propuesta:** Reemplazar todo el boilerplate con `@Getter` y `@Setter` de Lombok en ambas entidades.

---

#### REC-08 · `Role` no extiende `BaseEntity`
**Hallazgo:** Igual que `User`, la entidad `Role` no hereda de `BaseEntity`. Inconsistente con el patrón del proyecto.  
**Corrección propuesta:** `public class Role extends BaseEntity { ... }`

---

#### REC-09 · `@Where` deprecado en Hibernate 6
**Hallazgo:** `BaseEntity` usa `@Where(clause = "deleted_at IS NULL")`. Esta anotación fue deprecada en Hibernate 6 (incluido en Spring Boot 3.x).  
**Corrección propuesta:**
```java
// Reemplazar:
@Where(clause = "deleted_at IS NULL")

// Por:
@SQLRestriction("deleted_at IS NULL")
```

---

### 🔵 Mejoras / Deuda Técnica

#### REC-10 · Migrar de `ddl-auto=update` a Flyway *(acordado)*
**Hallazgo:** `ddl-auto=update` no elimina columnas renombradas, no es reproducible entre entornos y no deja trazabilidad de cambios.  
**Acción acordada:** Incorporar **Flyway** antes de crear nuevas entidades. La primera migración contendrá el esquema completo definido en el modelo relacional (Tarea 3).

---

#### REC-11 · Credenciales hardcodeadas en `application.properties`
**Hallazgo:** Usuario y contraseña de PostgreSQL están directamente en el archivo de propiedades, que está versionado en el repositorio.  
**Mejora propuesta:** Crear `application-local.properties` (excluido del `.gitignore`) y usar variables de entorno para credenciales. `application.properties` solo debe tener valores por defecto seguros o placeholders.

---

#### REC-12 · Agregar `Docker Compose` para entorno de desarrollo local
**Mejora propuesta:** Un `docker-compose.yml` con el contenedor de PostgreSQL permitiría que cualquier persona (o tú mismo en otro equipo) levante el entorno sin instalar PostgreSQL manualmente. Bajo costo, alto beneficio para reproducibilidad.

---

## 4. Decisiones Tecnológicas Acordadas

| Tecnología | Decisión | Justificación |
|---|---|---|
| **Flyway** | ✅ Incorporar ahora | Reemplaza `ddl-auto=update` con control versionado del esquema |
| **MapStruct** | ⏳ Evaluar más adelante | Útil cuando el mapeo manual entre entidades y DTOs empiece a escalar |
| **Docker Compose** | ✅ Recomendado (REC-12) | Reproducibilidad del entorno local, costo mínimo |

---

## 5. Estructura de Paquetes Objetivo

```
com.athletecore.api/
├── config/                        # Configuraciones transversales (Security, JPA)
├── shared/
│   ├── domain/BaseEntity.java     # Auditoría y soft delete compartidos
│   └── exception/
│       ├── GlobalExceptionHandler.java
│       └── ErrorResponse.java
├── user/                          # Módulo usuarios y autenticación
│   ├── domain/
│   ├── dto/
│   ├── UserController.java
│   ├── UserService.java
│   └── UserRepository.java
├── athlete/                       # Módulo deportistas
├── training/                      # Módulo entrenamientos y ciclos
├── checkup/                       # Módulo chequeos mensuales
└── report/                        # Módulo reportes y exportación PDF
```

---

*Documento generado como parte del análisis colaborativo del proyecto AthleteCore.*  
*Las correcciones marcadas como 🔴 se aplican primero; ninguna se ejecuta sin acuerdo previo.*