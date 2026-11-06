import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">
          Klik<span className="text-brand">Flow</span>
        </h1>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-6 p-6">
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <Alert variant="danger">Link inválido ou incompleto.</Alert>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
