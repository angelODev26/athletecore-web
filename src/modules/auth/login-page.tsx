import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { isApiError, toUserFacingMessage } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useLoginMutation } from "@/modules/auth/auth-api";

const loginSchema = z.object({
  username: z.string().min(1, "El nombre de usuario es obligatorio"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justRegistered = searchParams.get("registrado") === "1";
  const loginMutation = useLoginMutation();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const serverErrorMessage = (() => {
    const error = loginMutation.error;
    if (!error) {
      return null;
    }
    // El back no distingue usuario inexistente de password errónea (doc 02 §5).
    if (isApiError(error) && error.status === 401) {
      return "Credenciales inválidas";
    }
    if (isApiError(error) && error.status === 400) {
      return toUserFacingMessage(error);
    }
    return "No se pudo iniciar sesión. Inténtalo de nuevo en unos segundos.";
  })();

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values, {
      onSuccess: () => navigate("/", { replace: true }),
    });
  };

  return (
    <main className="bg-bg grid min-h-screen place-items-center p-6" data-testid="login-page">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>AthleteCore</CardTitle>
          <CardDescription>Inicia sesión con tu cuenta</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              {justRegistered ? (
                <Alert data-testid="register-success">
                  <AlertTitle>Cuenta creada</AlertTitle>
                  <AlertDescription>Ya puedes iniciar sesión con tus credenciales.</AlertDescription>
                </Alert>
              ) : null}
              {serverErrorMessage ? (
                <Alert variant="destructive" role="alert" data-testid="login-error">
                  <AlertTitle>Error de acceso</AlertTitle>
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
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="login-submit"
              >
                {loginMutation.isPending ? "Accediendo…" : "Iniciar sesión"}
              </Button>
              <p className="text-dim text-center text-label">
                ¿No tienes cuenta?{" "}
                <Link to="/registro" className="text-primary-text hover:underline">
                  Regístrate
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
