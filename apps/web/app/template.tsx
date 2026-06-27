// Re-mounts on every navigation → gives each page a subtle entrance animation.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="sc-animate-in">{children}</div>;
}
