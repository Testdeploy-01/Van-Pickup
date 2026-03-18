const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

export function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("browser-geolocation-unsupported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => reject(error),
      GEOLOCATION_OPTIONS,
    );
  });
}

export function formatGeolocationError(error) {
  if (!error) {
    return "ไม่สามารถอ่านตำแหน่งปัจจุบันได้";
  }

  if (error.message === "browser-geolocation-unsupported") {
    return "เบราว์เซอร์นี้ไม่รองรับการอ่าน GPS";
  }

  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "ผู้ใช้ไม่อนุญาตให้เข้าถึง GPS";
    case error.POSITION_UNAVAILABLE:
      return "อุปกรณ์ไม่สามารถระบุตำแหน่งได้ในขณะนี้";
    case error.TIMEOUT:
      return "การขอ GPS ใช้เวลานานเกินกำหนด";
    default:
      return "เกิดข้อผิดพลาดระหว่างขอ GPS";
  }
}
