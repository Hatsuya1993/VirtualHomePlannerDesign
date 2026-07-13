import { Image } from "react-native";

// A drop-in <Image> that never hands RCTImageLoader a null/empty uri (which
// throws "No suitable image URL loader found for (null)"). If the source is a
// { uri } object with no usable uri, it renders nothing; otherwise it renders a
// normal Image and swallows any load error.
export const SafeImage = ({ source, onError, ...props }) => {
    const isUriSource =
        source && typeof source === "object" && !Array.isArray(source) && "uri" in source;
    if (isUriSource && !source.uri) return null;
    return <Image source={source} onError={onError || (() => {})} {...props} />;
};
