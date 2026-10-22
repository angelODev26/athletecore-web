import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_MESSAGE,
  getDuplicateField,
  isApiError,
  toUserFacingMessage,
} from "@/lib/api";
import { ROLES, type Role, type UserResponse } from "@/lib/api/types";
import { useCreateUser } from "@/modules/users/users-api";

/*
 * Alta de usuario por ADMIN (`POST /users`, contrato 03 §3; design §C4).
 * Validación local EXACTA del DTO: username 3–50, email válido, nombres ≤100,
 * password ≥8 y confirmación igual + select de rol obligatorio (ADMIN/COACH/USER).
 * El 409 de username/email se marca en su campo con un mensaje seguro
 * (`getDuplicateField`); el 400 residual se muestra como mensaje global traducido.
 * El back es la autoridad: si no eres ADMIN responde 403 y la app pinta "sin
 * permisos"; aquí solo se oculta la acción.
 */

export const USER_ROLES = ROLES;
export type UserRole = Role;

/** Etiquetas ES del design §C3. Los valores viajan SIEMPRE en mayúsculas. */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  COACH: "Entrenador / Metodólogo",
  USER: "Deportista",
};

/** Etiquetas tolerantes para roles que el back pudiera añadir en el futuro. */
export function userRoleLabel(role: string): string {
  const normalized = role.startsWith("ROLE_") ? role.slice("ROLE_".length) : role;
  return USER_ROLE_LABELS[normalized as UserRole] ?? role;
}

export const userFormSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, "El nombre de usuario debe tener entre 3 y 50 caracteres")
      .max(50, "El nombre de usuario debe tener entre 3 y 50 caracteres"),
    email: z.email("Introduce un email válido"),
    firstName: z.string().trim().min(1, "El nombre es obligatorio").max(100, "El nombre es demasiado largo"),
    lastName: z.string().trim().min(1, "El apellido es obligatorio").max(100, "El apellido es demasiado largo"),
    password: z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_MIN_MESSAGE),
    confirmPassword: z.string().min(1, "Confirma la contraseña"),
    role: z.enum(USER_ROLES, { message: "Selecciona un rol" }),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Las contraseñas no coinciden",
      });
    }
  });

export type UserFormValues = z.infer<typeof userFormSchema>;

const EMPTY_VALUES: UserFormValues = {
  username: "",
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  confirmPassword: "",
  role: "USER",
};

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Aviso de alta completada; la página decide cómo confirmarlo al usuario. */
  onCreated?: (user: UserResponse) => void;
}

export function UserFormDialog({ open, onOpenChange, onCreated }: UserFormDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const createMutation = useCreateUser();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      form.reset(EMPTY_VALUES);
    }
  }, [open, form]);

  const handleSubmit = form.handleSubmit((values) => {
    setServerError(null);
    form.clearErrors();

    createMutation.mutate(
      {
        username: values.username.trim(),
        email: values.email.trim(),
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
        roles: [values.role],
      },
      {
        onSuccess: (created) => {
          onCreated?.(created);
          onOpenChange(false);
        },
        onError: (error) => {
          if (!isApiError(error)) {
            setServerError("No se pudo crear el usuario. Inténtalo de nuevo en unos segundos.");
            return;
          }
          if (error.status === 409) {
            const field = getDuplicateField(error);
            if (field === "username") {
              form.setError("username", {
                type: "server",
                message: "Ya existe un usuario con ese nombre de usuario",
              });
              return;
            }
            if (field === "email") {
              form.setError("email", {
                type: "server",
                message: "Ya existe un usuario con ese email",
              });
              return;
            }
            setServerError("Ya existe un usuario con esos datos o entran en conflicto con una cuenta existente.");
            return;
          }
          if (error.status === 400) {
            setServerError(toUserFacingMessage(error));
            return;
          }
          setServerError("No se pudo crear el usuario. Inténtalo de nuevo en unos segundos.");
        },
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="user-form-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>
            Crea una cuenta y asígnale un rol. Solo un administrador puede dar de alta usuarios.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate data-testid="user-form">
            {serverError ? (
              <Alert variant="destructive" role="alert" data-testid="user-form-error">
                <AlertTitle>No se pudo crear el usuario</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuario</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" data-testid="user-username-input" {...field} />
                    </FormControl>
                    <FormMessage
                      data-testid={
                        form.formState.errors.username?.type === "server"
                          ? "user-duplicate-field"
                          : undefined
                      }
                    />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="off" data-testid="user-email-input" {...field} />
                    </FormControl>
                    <FormMessage
                      data-testid={
                        form.formState.errors.email?.type === "server"
                          ? "user-duplicate-field"
                          : undefined
                      }
                    />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" data-testid="user-firstName-input" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" data-testid="user-lastName-input" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        data-testid="user-password-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar contraseña</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        data-testid="user-confirmPassword-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full" data-testid="user-role-select">
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {USER_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {USER_ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Administrador gestiona el sistema; Entrenador / Metodólogo opera entrenamientos y
                    chequeos; Deportista accede a su información.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createMutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="user-submit">
                {createMutation.isPending ? "Creando…" : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
