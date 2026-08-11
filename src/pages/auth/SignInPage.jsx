import SignInForm from "../../components/auth/SignInForm";
import heroImage from "../../assets/k2recovery.jpg";
import logomarkdark from "../../assets/k2logowhite.svg";

const SignInPage = () => {
  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden bg-cover bg-center"
      style={{ backgroundImage: `url(${heroImage})` }}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative min-h-screen w-full flex flex-col items-center justify-center px-8 sm:px-10 py-10 gap-6 lg:flex-row lg:px-16 lg:gap-32">
        <img src={logomarkdark} alt="K2 Recovery" className="h-14 sm:h-16 w-auto" />
        <SignInForm />
      </div>
    </div>
  );
};

export default SignInPage;
