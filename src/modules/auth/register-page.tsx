import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { isApiError, getDuplicateField, toUserFacingMessage } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useRegisterMutation } from "@/modules/auth/auth-api";

// Reglas del contrato (doc 03 §3); los mensajes se generan en front, nunca se
// muestra el texto crudo en inglés del backend.
const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, "El nombre de usuario debe tener entre 3 y 50 caracteres")
      .max(50, "El nombre de usuario debe tener entre 3 y 50 caracteres"),
    email: z.email("Introduce un email válido"),
    firstName: z.string().min(1, "El nombre es obligatorio").max(100, "El nombre es demasiado largo"),
    lastName: z.string().min(1, "El apellido es obligatorio").max(100, "El apellido es demasiado largo"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string().min(1, "Confirma la contraseña"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegisterMutation();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", email: "", firstName: "", lastName: "", password: "", confirmPassword: "" },
  });

  const serverErrorMessage = (() => {
    const error = registerMutation.error;
    if (!error) {
      return null;
    }
    if (isApiError(error) && error.status === 409) {
      // error por campo vía setError; el banner solo informa del genérico
      const field = getDuplicateField(error);
      if (field) {
        return null;
      }
      return "Los datos entran en conflicto con una cuenta existente.";
    }
    if (isApiError(error) && error.status === 400) {
      return toUserFacingMessage(error);
    }
    return "No se pudo crear la cuenta. Inténtalo de nuevo en unos segundos.";
  })();

  const onSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate(values, {
      onSuccess: () => navigate("/login?registrado=1", { replace: true }),
      onError: (error) => {
        if (isApiError(error)) {
          const field = getDuplicateField(error);
          if (field === "username") {
            form.setError("username", { type: "server", message: "Ese nombre de usuario ya existe" });
          } else if (field === "email") {
            form.setError("email", { type: "server", message: "Ese email ya tiene una cuenta" });
          } else if (error.status === 400 && error.payload.message === "Las contraseñas no coinciden") {
            form.setError("confirmPassword", { type: "server", message: "Las contraseñas no coinciden" });
          }
        }
      },
    });
  };

  return (
    <main className="bg-bg grid min-h-screen place-items-center p-6" data-testid="register-page">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>Regístrate para acceder a AthleteCore</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              {serverErrorMessage ? (
                <Alert variant="destructive" role="alert" data-testid="register-error">
                  <AlertTitle>Error de registro</AlertTitle>
                  <AlertDescription>{serverErrorMessage}</AlertDescription>
                </Alert>
              ) : null}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuario</FormLabel>
                    <FormControl>
                      <Input autoComplete="username" {...field} />
                    </FormControl>
                    <FormMessage />
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
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input autoComplete="given-name" {...field} />
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
                      <FormLabel>Apellidos</FormLabel>
                      <FormControl>
                        <Input autoComplete="family-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
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
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
                data-testid="register-submit"
              >
                {registerMutation.isPending ? "Creando cuenta…" : "Crear cuenta"}
              </Button>
              <p className="text-dim text-center text-label">
                ¿Ya tienes cuenta?{" "}
                <Link to="/login" className="text-primary-text hover:underline">
                  Inicia sesión
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
