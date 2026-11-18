import k2Mark from "../../assets/k2-mark-white.png";
import "./K2Loader.css";

// Full-screen branded loader (shown while auth resolves / a route chunk loads).
// Continues the native Android splash (static K2 mark on brand blue) so the
// handover from splash to app has no white flash.
const K2Loader = () => (
  <div className="k2-loader" role="status" aria-label="Loading">
    <div className="k2-loader__mark" style={{ "--k2-mark": `url(${k2Mark})` }}>
      <img src={k2Mark} alt="K2" />
    </div>
    <div className="k2-loader__name">RECOVERY</div>
    <div className="k2-loader__bar">
      <i />
    </div>
  </div>
);

export default K2Loader;
