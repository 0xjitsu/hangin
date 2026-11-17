import type { CategoryId } from './bands';

export type Lang = 'en' | 'tl';
export type Group = 'kids' | 'elders' | 'pregnant' | 'asthma' | 'everyone';
export const GROUPS: Group[] = ['kids', 'elders', 'pregnant', 'asthma', 'everyone'];

type Table = Record<CategoryId, Record<Group, string>>;

// Short, practical wording based on the EPA/AirNow health message for each AQI category:
// https://www.airnow.gov/aqi/aqi-basics/
const en: Table = {
  good: {
    kids: 'Normal outdoor play is fine.',
    elders: 'Normal activities are fine.',
    pregnant: 'Normal activities are fine.',
    asthma: 'Normal activities. Keep your inhaler handy as usual.',
    everyone: 'Air quality is good. Enjoy the outdoors.',
  },
  moderate: {
    kids: 'Outdoor play is fine. Watch for coughing.',
    elders: 'Fine to go out. Rest if you feel tired or short of breath.',
    pregnant: 'Fine to go out. Rest if you feel unwell.',
    asthma: 'Unusually sensitive people: go easy on long, hard exercise outside. Bring the inhaler.',
    everyone: 'Acceptable for most people.',
  },
  usg: {
    kids: 'Keep outdoor play short. Bring the inhaler if needed.',
    elders: 'Cut down long walks or exercise outside. Rest more.',
    pregnant: 'Keep time outdoors short. Choose indoors when you can.',
    asthma: 'Limit outdoor effort. Bring the inhaler. Follow your doctor’s action plan.',
    everyone: 'Most people are fine. Sensitive groups should cut back on long, hard outdoor activity.',
  },
  unhealthy: {
    kids: 'Play indoors. Skip outdoor sports and PE.',
    elders: 'Stay indoors where you can. Avoid effort outside.',
    pregnant: 'Stay indoors where possible. Avoid busy roads.',
    asthma: 'Stay indoors. Keep the inhaler with you. Call your doctor if symptoms get worse.',
    everyone: 'Cut down long or hard outdoor activity. A well-fitted N95 helps with particles (not ozone).',
  },
  very_unhealthy: {
    kids: 'Keep children indoors. No outdoor play.',
    elders: 'Stay indoors and rest. Ask for help with errands.',
    pregnant: 'Stay indoors. Contact your doctor if you feel unwell.',
    asthma: 'Stay indoors, keep medicine close. Seek care quickly if breathing is hard.',
    everyone: 'Avoid outdoor effort. Stay indoors with windows closed if you can.',
  },
  hazardous: {
    kids: 'Emergency conditions. Keep children indoors.',
    elders: 'Emergency conditions. Stay indoors. Seek care if unwell.',
    pregnant: 'Emergency conditions. Stay indoors. Seek care if unwell.',
    asthma: 'Emergency conditions. Stay indoors. Seek care quickly if breathing is hard.',
    everyone: 'Emergency conditions. Everyone should avoid all outdoor activity.',
  },
};

const tl: Table = {
  good: {
    kids: 'Ligtas ang normal na paglalaro sa labas.',
    elders: 'Ligtas ang mga karaniwang gawain.',
    pregnant: 'Ligtas ang mga karaniwang gawain.',
    asthma: 'Karaniwang gawain lang. Dala pa rin ang inhaler gaya ng dati.',
    everyone: 'Mabuti ang hangin. Mag-enjoy sa labas.',
  },
  moderate: {
    kids: 'Puwedeng maglaro sa labas. Bantayan kung inuubo.',
    elders: 'Puwedeng lumabas. Magpahinga kung pagod o hinihingal.',
    pregnant: 'Puwedeng lumabas. Magpahinga kung masama ang pakiramdam.',
    asthma: 'Kung sobrang sensitibo: iwasan ang matagal at mabigat na ehersisyo sa labas. Dalhin ang inhaler.',
    everyone: 'Katanggap-tanggap para sa karamihan.',
  },
  usg: {
    kids: 'Paikliin ang laro sa labas. Dalhin ang inhaler kung kailangan.',
    elders: 'Bawasan ang matagal na lakad o ehersisyo sa labas. Magpahinga nang mas madalas.',
    pregnant: 'Paikliin ang oras sa labas. Mas mainam sa loob ng bahay.',
    asthma: 'Limitahan ang pagod sa labas. Dalhin ang inhaler. Sundin ang plano ng doktor.',
    everyone: 'Ayos para sa karamihan. Ang sensitibong grupo ay dapat umiwas sa matagal at mabigat na gawain sa labas.',
  },
  unhealthy: {
    kids: 'Sa loob maglaro. Huwag munang mag-sports o PE sa labas.',
    elders: 'Manatili sa loob kung kaya. Iwasan ang pagod sa labas.',
    pregnant: 'Manatili sa loob kung maaari. Iwasan ang matataong kalsada.',
    asthma: 'Manatili sa loob. Dala ang inhaler. Tumawag sa doktor kung lumala ang sintomas.',
    everyone: 'Bawasan ang matagal o mabigat na gawain sa labas. Nakakatulong ang N95 sa alikabok (hindi sa ozone).',
  },
  very_unhealthy: {
    kids: 'Huwag palabasin ang mga bata. Walang laro sa labas.',
    elders: 'Manatili sa loob at magpahinga. Magpatulong sa pamimili.',
    pregnant: 'Manatili sa loob. Kausapin ang doktor kung masama ang pakiramdam.',
    asthma: 'Manatili sa loob, malapit ang gamot. Magpatingin agad kung nahihirapang huminga.',
    everyone: 'Iwasan ang pagod sa labas. Manatili sa loob at isara ang bintana kung kaya.',
  },
  hazardous: {
    kids: 'Mapanganib. Huwag palabasin ang mga bata.',
    elders: 'Mapanganib. Manatili sa loob. Magpatingin kung masama ang pakiramdam.',
    pregnant: 'Mapanganib. Manatili sa loob. Magpatingin kung masama ang pakiramdam.',
    asthma: 'Mapanganib. Manatili sa loob. Magpatingin agad kung nahihirapang huminga.',
    everyone: 'Mapanganib. Iwasan ng lahat ang anumang gawain sa labas.',
  },
};

export function adviceFor(lang: Lang, category: CategoryId, group: Group): string {
  return (lang === 'tl' ? tl : en)[category][group];
}
