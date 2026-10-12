import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/*
 * Formulario de datos básicos del deportista, reutilizado por el paso 1 del alta
 * y por la edición parcial (design.md A5). `birthDate` no existe en el DTO de
 * creación (deuda T6): solo se muestra en edición.
 */

/** Regla del contrato (doc 04 §2): fecha pasada o hoy, ISO YYYY-MM-DD. */
export const athleteBirthDateSchema = z
  .string()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Introduce una fecha válida (AAAA-MM-DD)")
  .refine((value) => {
    if (value === "") {
      return true;
    }
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date <= today;
  }, "La fecha de nacimiento no puede ser futura");

export const athleteBasicSchema = z.object({
  // Contrato doc 04 §2: username 3–255; email con formato, máx 255.
  username: z
    .string()
    .trim()
    .min(3, "El nombre de usuario debe tener entre 3 y 255 caracteres")
    .max(255, "El nombre de usuario debe tener entre 3 y 255 caracteres"),
  email: z.email("Introduce un email válido").max(255, "El email es demasiado largo"),
  firstName: z.string().trim().min(1, "El nombre es obligatorio").max(100, "El nombre es demasiado largo"),
  lastName: z.string().trim().min(1, "El apellido es obligatorio").max(100, "El apellido es demasiado largo"),
  photoUrl: z
    .string()
    .trim()
    .max(2048, "La URL es demasiado larga")
    .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), "Introduce una URL válida (http o https)"),
  birthDate: athleteBirthDateSchema,
});

export type AthleteBasicFormValues = z.infer<typeof athleteBasicSchema>;

export const emptyAthleteBasicValues: AthleteBasicFormValues = {
  username: "",
  email: "",
  firstName: "",
  lastName: "",
  photoUrl: "",
  birthDate: "",
};

interface AthleteBasicFormProps {
  form: UseFormReturn<AthleteBasicFormValues>;
  /** Edición: username/email bloqueados, la API no permite cambiarlos (A5). */
  lockIdentity?: boolean;
  withBirthDate?: boolean;
  pending?: boolean;
  submitLabel: string;
  serverError?: string | null;
  onSubmit: (values: AthleteBasicFormValues) => void;
  /** Acción secundaria junto al submit (p. ej. "Omitir y terminar"). */
  footerExtra?: ReactNode;
}

export function AthleteBasicForm({
  form,
  lockIdentity = false,
  withBirthDate = false,
  pending = false,
  submitLabel,
  serverError,
  onSubmit,
  footerExtra,
}: AthleteBasicFormProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {serverError ? (
          <Alert variant="destructive" role="alert" data-testid="athlete-form-error">
            <AlertTitle>No se pudieron guardar los datos</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre de usuario</FormLabel>
                <FormControl>
                  <Input autoComplete="off" disabled={lockIdentity} data-testid="athlete-form-username" {...field} />
                </FormControl>
                {lockIdentity ? <FormDescription>No editable por la API</FormDescription> : <FormMessage />}
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
                  <Input type="email" autoComplete="off" disabled={lockIdentity} data-testid="athlete-form-email" {...field} />
                </FormControl>
                {lockIdentity ? <FormDescription>No editable por la API</FormDescription> : <FormMessage />}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input autoComplete="off" data-testid="athlete-form-firstName" {...field} />
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
                  <Input autoComplete="off" data-testid="athlete-form-lastName" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="photoUrl"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Foto (URL)</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://…"
                    autoComplete="off"
                    data-testid="athlete-form-photoUrl"
                    {...field}
                  />
                </FormControl>
                <FormDescription>Pega la URL de una foto; no hay subida de archivos.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {withBirthDate ? (
            <FormField
              control={form.control}
              name="birthDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de nacimiento</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="athlete-birthdate-input" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending} data-testid="athlete-form-submit">
            {pending ? "Guardando…" : submitLabel}
          </Button>
          {footerExtra}
        </div>
      </form>
    </Form>
  );
}
