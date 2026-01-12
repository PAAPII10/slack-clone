import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import { SignInFlow } from "../types";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { TriangleAlert } from "lucide-react";

interface SignUpCardProps {
  setState: (state: SignInFlow) => void;
}
export function SignUpCard({ setState }: SignUpCardProps) {
  const { signIn } = useAuthActions();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPasswordSignIn = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setPending(true);

    signIn("password", {
      name,
      email,
      password,
      flow: "signUp",
    })
      .catch((error) => {
        console.error(error);
        setError("Something went wrong");
      })
      .finally(() => {
        setPending(false);
      });
  };

  const handleProviderSignIn = (value: "github" | "google") => {
    setPending(true);
    signIn(value).finally(() => {
      setPending(false);
    });
  };
  return (
    <Card className="h-full w-full p-8">
      <CardHeader className="px-0 pt-0">
        <CardTitle>Sign up to continue</CardTitle>
        <CardDescription>
          Use your email or another service to sign up
        </CardDescription>
      </CardHeader>

      {error && (
        <div className="bg-destructive/15 p-3 rounded-md flex  items-center gap-x-2 text-sm text-destructive mb-6">
          <TriangleAlert className="size-4" /> <p>{error}</p>
        </div>
      )}
      <CardContent className="space-y-5 px-0 pb-0">
        <form className="space-y-2.5" onSubmit={onPasswordSignIn}>
          <Input
            disabled={pending}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            type="text"
            required
          />
          <Input
            disabled={pending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            required
          />
          <Input
            disabled={pending}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            required
          />
          <Input
            disabled={false}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            type="password"
            required
          />
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            Continue
          </Button>
        </form>
        <Separator />
        <div className="flex flex-col gap-y-2.5">
          <Button
            variant="outline"
            className="w-full relative"
            size="lg"
            disabled={pending}
            onClick={() => handleProviderSignIn("google")}
          >
            <FcGoogle className="size-5 absolute left-2.5 top-2.5" />
            Continue with Google
          </Button>
          <Button
            variant="outline"
            className="w-full relative"
            size="lg"
            disabled={pending}
            onClick={() => handleProviderSignIn("github")}
          >
            <FaGithub className="size-5 absolute left-2.5 top-2.5" />
            Continue with Github
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Already have an account?{" "}
          <span
            className="text-sky-700 cursor-pointer hover:underline"
            onClick={() => setState("signIn")}
          >
            Sign in
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
