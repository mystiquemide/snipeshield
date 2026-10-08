import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import { WalletProvider } from "./lib/wallet";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Launches from "./pages/Launches";
import TokenPage from "./pages/Token";
import Launch from "./pages/Launch";
import Policy from "./pages/Policy";
import Deploy from "./pages/Deploy";

function NotFound() {
  return (
    <Layout title="Page not found">
      <div className="wrap py-20">
        <h1 className="text-[36px]">We couldn't find that page.</h1>
        <p className="mt-3 text-slate">The link may be old or mistyped. Launches and the launch form are a click away.</p>
        <Link className="btn-primary mt-6" to="/launches">Browse launches</Link>
      </div>
    </Layout>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/how" element={<Home />} />
          <Route path="/launches" element={<Launches />} />
          <Route path="/token/:address" element={<TokenPage />} />
          <Route path="/launch" element={<Launch />} />
          <Route path="/policy/:processor/:id" element={<Policy />} />
          <Route path="/deploy" element={<Deploy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}
