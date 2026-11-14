const genres = {
  title: "Genres",
  subtitle: "A rough classification of the household's books",
  add: "Add genre",
  addTitle: "Add a genre",
  addSubmit: "Add",
  name: "Name",
  save: "Save",
  delete: "Delete genre",
  deleteTitle: "Delete {{name}}?",
  deleteText_zero: "No book has this genre.",
  deleteText_one: "{{count}} book has this genre. It will then have none.",
  deleteText_other:
    "{{count}} books have this genre. They will then have none.",
  deleteSubmit: "Delete",
  exists: "There is already a genre with this name.",
  books_one: "{{count}} book",
  books_other: "{{count}} books",
  empty: "No genres. Add the first one, such as Crime or Cookbook.",
  noSelection: "Select a genre to rename or delete it.",
  genre: "Genre",
  none: "No genre",
  builtIn: {
    novel: "Novel",
    crime: "Crime",
    thriller: "Thriller",
    fantasy: "Fantasy",
    "science-fiction": "Science fiction",
    "historical-novel": "Historical novel",
    romance: "Romance",
    horror: "Horror",
    humour: "Humour",
    classic: "Classic",
    "childrens-book": "Children's book",
    "young-adult": "Young adult",
    comic: "Comic & graphic novel",
    "poetry-drama": "Poetry & drama",
    "non-fiction": "Non-fiction",
    biography: "Biography",
    history: "History",
    "politics-society": "Politics & society",
    "science-nature": "Science & nature",
    guide: "Guide & self-help",
    cookbook: "Cookbook",
    "travel-guide": "Travel guide",
    "art-photography": "Art & photography",
    reference: "Reference",
  },
};

export default genres;

declare module "../../i18n/types" {
  interface Namespaces {
    genres: typeof genres;
  }
}
