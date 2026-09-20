import config from "@nitap/eslint-config";
import { layerRules } from "@nitap/eslint-config/boundaries";

const eslintConfig = [...config, ...layerRules];

export default eslintConfig;
