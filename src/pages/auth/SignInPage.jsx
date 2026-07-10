import SignInForm from "../../components/auth/SignInForm";
import heroImage from "../../assets/signbg.jpg";
import logomarkdark from "../../assets/k2logo.svg";

const SignInPage = () => {
  return (
    <div
      className="hero min-h-screen"
      style={{
        backgroundImage: `url(${heroImage})`,
      }}
    >
      <div className="hero-overlay bg-black/60 w-full min-h-screen">
        <div className="min-h-screen flex flex-col items-center justify-center px-5 md:px-10 py-10 gap-6 lg:flex-row lg:px-16 lg:gap-32">
          <img src={logomarkdark} alt="MyApp Logo" className="h-16 w-auto" />
         <SignInForm />
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
