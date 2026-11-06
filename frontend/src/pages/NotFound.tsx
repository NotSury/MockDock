import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="grid h-full place-items-center">
      <EmptyState
        icon={<Compass />}
        title="This page drifted off"
        description="The page you're looking for doesn't exist. Mock endpoints live under /mock/<project>/…"
        action={
          <Link to="/">
            <Button variant="primary">Back to dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}
