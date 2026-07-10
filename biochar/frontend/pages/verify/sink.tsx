import React, { useState, useEffect } from "react";

declare var process: { env: { [key: string]: string | undefined } };

interface SinkDetails {
  producer_name: string;
  delivery_ticket_id: string;
  shipped_mass_tons: number;
  already_attested: boolean;
  sink_id: string;
  photo_evidence_url: string;
}

export const VerifySinkPage: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  
  // Geolocation states
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locSuccess, setLocSuccess] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  // Photo states
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Details fetch states
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [sinkDetails, setSinkDetails] = useState<SinkDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Submission states
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 1. Extract token from URL search query on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setDetailsError("Missing attestation verification token in URL.");
      setLoadingDetails(false);
    }
  }, []);

  // 2. Fetch shipment details on token load
  useEffect(() => {
    if (!token) return;

    const fetchDetails = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${backendUrl}/api/v1/biochar/public/sink-details?token=${token}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "Failed to load delivery details.");
        }
        const data = await res.json();
        setSinkDetails(data);
      } catch (err: any) {
        setDetailsError(err.message);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchDetails();
  }, [token]);

  // 3. Geolocation capture handler
  const handleCaptureLocation = () => {
    setLocLoading(true);
    setLocError(null);
    setLocSuccess(false);

    if (!navigator.geolocation) {
      setLocError("GPS Geolocation is not supported by this mobile browser.");
      setLocLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocLoading(false);
        setLocSuccess(true);
      },
      (err) => {
        let msg = "Failed to capture location coordinates.";
        if (err.code === err.PERMISSION_DENIED) {
          msg = "Please enable GPS location permission for this browser tab.";
        }
        setLocError(msg);
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // 4. Photo upload & preview handler
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 5. Submit attestation payload
  const handleSubmitAttestation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || latitude === null || longitude === null || !photoFile) {
      setSubmitError("Please capture both your current location and delivery photo.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const formData = new FormData();
    formData.append("token", token);
    formData.append("latitude", String(latitude));
    formData.append("longitude", String(longitude));
    formData.append("evidence_file", photoFile);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${backendUrl}/api/v1/biochar/public/attest`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Verification upload failed.");
      }

      setSubmitSuccess(true);
      if (sinkDetails) {
        setSinkDetails({ ...sinkDetails, already_attested: true });
      }
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Rendering Loader State
  if (loadingDetails) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Loading delivery details...</p>
        </div>
      </div>
    );
  }

  // Rendering Error Loading State
  if (detailsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Verification Link Invalid</h3>
          <p className="text-xs text-gray-500 leading-relaxed">{detailsError}</p>
        </div>
      </div>
    );
  }

  // Rendering Success Completion State
  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Delivery Attested</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Geotagged coordinates and delivery photograph successfully uploaded and verified.
          </p>
          <div className="pt-2 text-2xs font-mono text-gray-400">
            Audit Ticket ID: {sinkDetails?.delivery_ticket_id}
          </div>
        </div>
      </div>
    );
  }

  // Check if already completed
  if (sinkDetails?.already_attested) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Attestation Completed</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            This delivery ticket has already been geotagged and attested. No further action is required.
          </p>
          <div className="pt-2 text-2xs font-mono text-gray-400">
            Ticket: {sinkDetails.delivery_ticket_id}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="py-4 px-6 border-b border-gray-150 bg-gray-50 text-center">
          <h1 className="text-md font-extrabold text-gray-900">Farmer Verification Gateway</h1>
          <p className="text-3xs text-gray-400 uppercase tracking-widest font-bold mt-1">
            Biochar Removal Pipeline
          </p>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmitAttestation} className="p-6 space-y-5">
          {/* Shipment metadata cards */}
          <div className="bg-gray-50 rounded border border-gray-200 p-4 space-y-3 text-xs">
            <div>
              <span className="text-gray-400 uppercase text-[9px] tracking-wider block font-bold">
                Producer / Project
              </span>
              <span className="font-bold text-gray-900 mt-0.5 block">
                {sinkDetails?.producer_name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <span className="text-gray-400 uppercase text-[9px] tracking-wider block font-bold">
                  Delivery Ticket ID
                </span>
                <span className="font-mono font-bold text-gray-900 mt-0.5 block">
                  {sinkDetails?.delivery_ticket_id}
                </span>
              </div>
              <div>
                <span className="text-gray-400 uppercase text-[9px] tracking-wider block font-bold">
                  Shipped Mass
                </span>
                <span className="font-bold text-gray-900 mt-0.5 block">
                  {sinkDetails?.shipped_mass_tons} tons
                </span>
              </div>
            </div>
          </div>

          {/* Form Step 1: Location Capture */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-600 block">
              Step 1: Verify Location coordinates
            </label>
            <button
              type="button"
              onClick={handleCaptureLocation}
              disabled={locLoading}
              className={`w-full py-2.5 px-4 text-xs font-bold rounded border transition-all duration-150 flex items-center justify-center gap-2 ${
                locSuccess
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50 active:bg-gray-100"
              }`}
            >
              {locLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
                  Requesting GPS...
                </>
              ) : locSuccess ? (
                <>
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Field Location Confirmed
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Confirm Field Location
                </>
              )}
            </button>
            
            {/* Locked Coordinates Display */}
            {locSuccess && latitude !== null && longitude !== null && (
              <div className="bg-emerald-50/50 rounded border border-emerald-100 p-2.5 text-center text-xs font-mono font-medium text-emerald-800 flex justify-center gap-4">
                <span>LAT: {latitude.toFixed(6)}</span>
                <span>LON: {longitude.toFixed(6)}</span>
              </div>
            )}
            {locError && <p className="text-3xs text-red-500 font-bold leading-tight">{locError}</p>}
          </div>

          {/* Form Step 2: Photo Capture */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-600 block">
              Step 2: Take Delivery Photograph
            </label>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
                id="camera-input-field"
              />
              <label
                htmlFor="camera-input-field"
                className={`w-full py-2.5 px-4 text-xs font-bold rounded border transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer ${
                  photoPreview
                    ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                    : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50 active:bg-gray-100"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {photoPreview ? "Retake Delivery Photo" : "Capture Delivery Photo"}
              </label>
            </div>

            {/* Image Preview Window */}
            {photoPreview && (
              <div className="relative aspect-video w-full rounded border border-gray-200 overflow-hidden shadow-inner">
                <img
                  src={photoPreview}
                  alt="Delivery proof preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          {/* Submission Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || latitude === null || longitude === null || !photoFile}
              className={`w-full py-3 rounded-lg text-xs font-bold text-white transition-all duration-150 flex items-center justify-center gap-2 ${
                submitting || latitude === null || longitude === null || !photoFile
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-sm"
              }`}
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading attestation...
                </>
              ) : (
                "Submit Attestation"
              )}
            </button>
            {submitError && (
              <p className="text-3xs text-red-500 font-bold text-center mt-2 leading-tight">
                {submitError}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
export default VerifySinkPage;
